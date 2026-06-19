import express, { NextFunction, Response } from 'express';
import Homework from '../models/Homework';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Subject from '../models/Subject';
import { authenticate, canManageAcademic } from '../middleware/auth';

const router = express.Router();
const managerRoles = ['admin', 'super_admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher'];
const teacherRoles = ['class_teacher', 'subject_teacher', 'teacher'];
const roleIn = (role: string, roles: readonly string[]) => roles.includes(role);

const parseDateOnly = (value?: string) => {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getFullYear(), date.getMonth(), date.getDate());
};
const dayRange = (value?: string) => { const start = parseDateOnly(value); if (!start) return null; const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1); return { start, end }; };
const getTeacher = (req: any) => Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).lean();
const applyFilters = (query: any, req: any, options: { allowClass?: boolean; allowSection?: boolean } = {}) => { const { allowClass = true, allowSection = true } = options; if (req.query.date) { const range = dayRange(String(req.query.date)); if (range) query.dueDate = { $gte: range.start, $lt: range.end }; } if (req.query.subject) query.subject = new RegExp(String(req.query.subject).trim(), 'i'); if (allowClass && req.query.classId) query.classId = req.query.classId; if (allowSection && req.query.sectionId) query.$or = [{ sectionId: req.query.sectionId }, { sectionId: { $exists: false } }, { sectionId: null }]; return query; };
const populateHomework = (query: any) => Homework.find(query).populate('classId', 'name grade').populate('sectionId', 'name').populate('createdBy', 'name email role').sort({ dueDate: 1, createdAt: -1 }).lean();
const assignedClassesForTeacher = async (req: any) => { const teacher = await getTeacher(req); return (teacher?.assignedClasses || []).map((id: any) => String(id)); };
const canManageHomeworkClassAndSubject = async (req: any, classId: any, subjectName: string) => {
  const role = req.user.role;
  if (roleIn(role, ['admin', 'super_admin', 'head', 'assistant_head'])) return true;
  if (!roleIn(role, teacherRoles)) return false;
  const teacher = await getTeacher(req);
  if (!teacher) return false;

  const assignedClasses = (teacher.assignedClasses || []).map((id: any) => String(id));
  if (!assignedClasses.includes(String(classId))) return false;

  const assignedSubjectIds = (teacher.subjects || []).map((id: any) => String(id));
  if (!assignedSubjectIds.length) return false;

  if (!subjectName || !subjectName.trim()) return false;
  const escapedSubjectName = subjectName.trim().replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
  const matchedSubject = await Subject.findOne({
    _id: { $in: assignedSubjectIds },
    classId: classId,
    $or: [
      { name: { $regex: new RegExp(`^${escapedSubjectName}$`, 'i') } },
      { code: { $regex: new RegExp(`^${escapedSubjectName}$`, 'i') } }
    ]
  }).lean();

  return !!matchedSubject;
};
const homeworkWriteGuard = async (req: any, res: Response, next: NextFunction) => { if (!roleIn(req.user.role, managerRoles)) return res.status(403).json({ message: 'Access denied. Students and parents cannot manage homework.' }); if (roleIn(req.user.role, ['admin', 'super_admin'])) return next(); return canManageAcademic()(req, res, next); };

router.get('/', authenticate, async (req: any, res) => {
  try {
    const role = req.user.role;
    const base: any = { institutionId: req.user.institutionId };
    if (roleIn(role, managerRoles)) {
      const query = applyFilters(base, req, { allowClass: true, allowSection: true });
      if (roleIn(role, teacherRoles)) { const assignedClasses = await assignedClassesForTeacher(req); query.classId = { $in: assignedClasses }; }
      const homework = await populateHomework(query);
      return res.json({ homework });
    }
    if (role === 'student') {
      const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).select('classId sectionId').lean();
      if (!student?.classId) return res.json({ homework: [] });
      const query: any = { institutionId: req.user.institutionId, classId: student.classId, isPublished: true };
      applyFilters(query, req, { allowClass: false, allowSection: false });
      if (student.sectionId) query.$or = [{ sectionId: student.sectionId }, { sectionId: { $exists: false } }, { sectionId: null }];
      const homework = await populateHomework(query);
      return res.json({ homework });
    }
    if (role === 'parent') {
      const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).select('children').lean();
      const students = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] }, isActive: true }).select('classId sectionId').lean();
      const classIds = [...new Set(students.map((student: any) => String(student.classId)).filter(Boolean))];
      if (!classIds.length) return res.json({ homework: [] });
      const query: any = { institutionId: req.user.institutionId, classId: { $in: classIds }, isPublished: true };
      applyFilters(query, req, { allowClass: false, allowSection: false });
      const homework = await populateHomework(query);
      return res.json({ homework });
    }
    return res.json({ homework: [] });
  } catch (error) { return res.status(500).json({ message: 'Failed to load homework', error }); }
});

router.post('/', authenticate, homeworkWriteGuard, async (req: any, res) => {
  try {
    const { title, description, subject, classId, sectionId, dueDate, assignedDate } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ message: 'Title is required.' });
    if (!classId) return res.status(400).json({ message: 'Class is required.' });
    if (!dueDate) return res.status(400).json({ message: 'Due date is required.' });
    if (!(await canManageHomeworkClassAndSubject(req, classId, subject || ''))) return res.status(403).json({ message: 'Access denied. You can create homework only for your assigned class and subject.' });
    const homework = await Homework.create({ title: String(title).trim(), description: description ? String(description).trim() : undefined, subject: subject ? String(subject).trim() : undefined, classId, sectionId: sectionId || undefined, dueDate: parseDateOnly(dueDate) || new Date(dueDate), assignedDate: parseDateOnly(assignedDate) || new Date(), createdBy: req.user._id, institutionId: req.user.institutionId, isPublished: true });
    const created = await Homework.findById(homework._id).populate('classId', 'name grade').populate('sectionId', 'name').populate('createdBy', 'name email role').lean();
    return res.status(201).json({ homework: created, message: 'Homework created successfully.' });
  } catch (error) { return res.status(500).json({ message: 'Failed to create homework', error }); }
});

router.delete('/:id', authenticate, homeworkWriteGuard, async (req: any, res) => {
  try {
    const homework = await Homework.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!homework) return res.status(404).json({ message: 'Homework not found' });
    if (!(await canManageHomeworkClassAndSubject(req, homework.classId, homework.subject || ''))) return res.status(403).json({ message: 'Access denied. You can delete homework only for assigned class and subject.' });
    if (!roleIn(req.user.role, ['head', 'assistant_head', 'admin', 'super_admin']) && String(homework.createdBy) !== String(req.user._id)) return res.status(403).json({ message: 'Only the owner or Head/Assistant Head can delete this homework.' });
    await homework.deleteOne();
    return res.json({ message: 'Homework deleted' });
  } catch (error) { return res.status(500).json({ message: 'Failed to delete homework', error }); }
});

export default router;
