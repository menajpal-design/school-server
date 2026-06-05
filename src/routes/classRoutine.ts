import express from 'express';
import mongoose from 'mongoose';
import ClassRoutine from '../models/ClassRoutine';
import Institution from '../models/Institution';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Subject from '../models/Subject';
import { authenticate, canManageAcademic } from '../middleware/auth';

const router = express.Router();

const headApprovalRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const teacherProposalRoles = ['class_teacher', 'subject_teacher', 'teacher'];
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));

const resolveSubject = async (req: any) => {
  const subjectId = req.body.subjectId;
  if (!subjectId || !isObjectId(subjectId)) return { subjectId: undefined, subjectName: '' };
  const subject = await Subject.findOne({ _id: subjectId, institutionId: req.user.institutionId }).select('name code').lean();
  if (!subject) return { subjectId: undefined, subjectName: '' };
  return { subjectId: subject._id, subjectName: subject.name || subject.code || '' };
};

const normalizeBody = async (req: any): Promise<any> => {
  const role = req.user?.role;
  const canApproveDirectly = headApprovalRoles.includes(role);
  const requestedStatus = req.body.status;
  const status = canApproveDirectly ? (requestedStatus || (req.body.isPublic === true ? 'approved' : 'draft')) : 'proposed';
  const subject = await resolveSubject(req);
  return {
    classId: req.body.classId,
    sectionId: req.body.sectionId || undefined,
    subjectId: subject.subjectId,
    teacherId: req.body.teacherId || req.user?._id || undefined,
    dayOfWeek: req.body.dayOfWeek,
    periodName: req.body.periodName,
    startTime: req.body.startTime,
    endTime: req.body.endTime,
    room: req.body.room,
    note: subject.subjectName || req.body.note,
    proposalNote: req.body.proposalNote,
    status,
    isActive: req.body.isActive !== false,
    isPublic: canApproveDirectly && req.body.isPublic === true,
    institutionId: req.user.institutionId,
    createdBy: req.user._id,
  };
};

const routineQuery = () => ClassRoutine.find()
  .populate('classId', 'name grade academicYear')
  .populate('sectionId', 'name')
  .populate('subjectId', 'name code')
  .populate('teacherId', 'name email phone role')
  .populate('createdBy', 'name role')
  .populate('approvedBy', 'name role');

const buildFilter = (req: any, base: any = {}) => {
  const query: any = { ...base };
  if (req.query.classId) query.classId = req.query.classId;
  if (req.query.sectionId) query.sectionId = req.query.sectionId;
  if (req.query.dayOfWeek) query.dayOfWeek = req.query.dayOfWeek;
  if (req.query.status) query.status = req.query.status;
  return query;
};

router.get('/public', async (req, res) => {
  try {
    let institution: any = null;
    if (req.query.institutionId) institution = await Institution.findOne({ _id: req.query.institutionId, isActive: true });
    else {
      const domain = String(req.query.domain || req.hostname || '').replace(/^www\./, '').toLowerCase();
      if (domain) institution = await Institution.findOne({ isActive: true, $or: [{ website: new RegExp(domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }, { domains: domain }, { domains: `www.${domain}` }] });
    }
    if (!institution) return res.status(404).json({ message: 'School not found' });
    const query: any = buildFilter(req, { institutionId: institution._id, isPublic: true, isActive: true, status: 'approved' });
    const routines = await routineQuery().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
    res.json({ institution: { id: institution._id, name: institution.name, address: institution.address, phone: institution.phone, email: institution.email }, routines });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load public class routine', error });
  }
});

router.use(authenticate);

router.get('/my', async (req: any, res) => {
  try {
    const base: any = { institutionId: req.user.institutionId, isActive: true, status: 'approved', isPublic: true };
    const query = buildFilter(req, base);

    if (req.user.role === 'student') {
      const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).select('classId sectionId rollNumber').lean();
      if (!student) return res.json({ routines: [], profile: null, message: 'Student profile not found.' });
      query.classId = student.classId;
      query.$or = [{ sectionId: student.sectionId }, { sectionId: { $exists: false } }, { sectionId: null }];
      const routines = await routineQuery().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
      return res.json({ routines, profile: student });
    }

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      const children = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] }, isActive: true })
        .select('classId sectionId rollNumber userId')
        .populate('userId', 'name')
        .populate('classId', 'name')
        .populate('sectionId', 'name')
        .lean();
      if (!children.length) return res.json({ routines: [], children: [], message: 'No child profile found.' });
      const or: any[] = [];
      children.forEach((child: any) => {
        or.push({ classId: child.classId?._id || child.classId, sectionId: child.sectionId?._id || child.sectionId });
        or.push({ classId: child.classId?._id || child.classId, sectionId: { $exists: false } });
        or.push({ classId: child.classId?._id || child.classId, sectionId: null });
      });
      query.$or = or;
      const routines = await routineQuery().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
      return res.json({ routines, children });
    }

    const routines = await routineQuery().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
    res.json({ routines });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load your class routine', error });
  }
});

router.use(canManageAcademic());

router.get('/', async (req: any, res) => {
  try {
    const base: any = { institutionId: req.user.institutionId };
    if (teacherProposalRoles.includes(req.user.role)) base.$or = [{ createdBy: req.user._id }, { teacherId: req.user._id }, { status: 'approved', isPublic: true }];
    const query = buildFilter(req, base);
    const routines = await routineQuery().where(query).sort({ dayOfWeek: 1, startTime: 1 }).lean();
    res.json({ routines });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load class routines', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    const payload: any = { ...(await normalizeBody(req)) };
    if (headApprovalRoles.includes(req.user.role) && payload.status === 'approved') {
      payload.approvedBy = req.user._id;
      payload.approvedAt = new Date();
      payload.isPublic = req.body.isPublic === true;
    }
    const routine = await ClassRoutine.create(payload);
    const created = await routineQuery().where({ _id: routine._id, institutionId: req.user.institutionId }).findOne();
    res.status(201).json({ routine: created, message: headApprovalRoles.includes(req.user.role) ? 'Class routine created' : 'Class routine proposal submitted for approval' });
  } catch (error: any) { res.status(500).json({ message: error?.message || 'Failed to create class routine', error }); }
});

router.put('/:id', async (req: any, res) => {
  try {
    const routine = await ClassRoutine.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });
    const userId = String(req.user._id || req.user.id);
    const ownerId = String(routine.createdBy || '');
    if (!headApprovalRoles.includes(req.user.role) && ownerId !== userId) return res.status(403).json({ message: 'Only the proposal owner or Head/Assistant Head can edit this routine.' });
    const payload: any = { ...(await normalizeBody(req)) };
    Object.assign(routine, payload);
    if (headApprovalRoles.includes(req.user.role) && payload.status === 'approved') { routine.approvedBy = req.user._id; routine.approvedAt = new Date(); routine.isPublic = req.body.isPublic === true; }
    else if (!headApprovalRoles.includes(req.user.role)) { routine.status = 'proposed'; routine.isPublic = false; routine.approvedBy = undefined; routine.approvedAt = undefined; }
    await routine.save();
    const updated = await routineQuery().where({ _id: routine._id, institutionId: req.user.institutionId }).findOne();
    res.json({ routine: updated, message: headApprovalRoles.includes(req.user.role) ? 'Class routine updated' : 'Class routine proposal updated' });
  } catch (error: any) { res.status(500).json({ message: error?.message || 'Failed to update class routine', error }); }
});

router.patch('/:id/approval', async (req: any, res) => {
  try {
    if (!headApprovalRoles.includes(req.user.role)) return res.status(403).json({ message: 'Only Head or Assistant Head can approve routine proposals.' });
    const status = req.body.status;
    if (!['approved', 'rejected', 'proposed'].includes(status)) return res.status(400).json({ message: 'Invalid approval status.' });
    const update: any = { status, approvalNote: req.body.approvalNote, isPublic: status === 'approved' ? req.body.isPublic === true : false };
    if (status === 'approved') { update.approvedBy = req.user._id; update.approvedAt = new Date(); }
    else { update.approvedBy = undefined; update.approvedAt = undefined; }
    const routine = await ClassRoutine.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, update, { new: true });
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });
    const updated = await routineQuery().where({ _id: routine._id, institutionId: req.user.institutionId }).findOne();
    res.json({ routine: updated, message: status === 'approved' ? 'Class routine approved' : status === 'rejected' ? 'Class routine rejected' : 'Class routine returned to proposal' });
  } catch (error) { res.status(500).json({ message: 'Failed to update routine approval', error }); }
});

router.patch('/:id/public', async (req: any, res) => {
  try {
    if (!headApprovalRoles.includes(req.user.role)) return res.status(403).json({ message: 'Only Head or Assistant Head can publish routine.' });
    const routine = await ClassRoutine.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId, status: 'approved' }, { isPublic: req.body.isPublic === true }, { new: true });
    if (!routine) return res.status(404).json({ message: 'Approved class routine not found' });
    res.json({ routine, message: routine.isPublic ? 'Class routine is public' : 'Class routine is private' });
  } catch (error) { res.status(500).json({ message: 'Failed to update routine public status', error }); }
});

router.delete('/:id', async (req: any, res) => {
  try {
    const routine = await ClassRoutine.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!routine) return res.status(404).json({ message: 'Class routine not found' });
    const userId = String(req.user._id || req.user.id);
    const ownerId = String(routine.createdBy || '');
    if (!headApprovalRoles.includes(req.user.role) && ownerId !== userId) return res.status(403).json({ message: 'Only owner or Head/Assistant Head can delete this routine.' });
    await routine.deleteOne();
    res.json({ message: 'Class routine deleted' });
  } catch (error) { res.status(500).json({ message: 'Failed to delete class routine', error }); }
});

export default router;