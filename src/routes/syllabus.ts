import express from 'express';
import { authenticate } from '../middleware/auth';
import Syllabus from '../models/Syllabus';
import Student from '../models/Student';
import Parent from '../models/Parent';

const router = express.Router();

const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin', 'subject_teacher', 'class_teacher'];
const canManage = (role: string) => manageRoles.includes(role);

const buildVisibilityQuery = async (req: any) => {
  const query: any = { institutionId: req.user.institutionId };
  if (req.query.classId) query.classId = req.query.classId;
  if (req.query.sectionId) query.sectionId = req.query.sectionId;
  if (req.query.subjectId) query.subjectId = req.query.subjectId;
  if (req.query.term) query.term = req.query.term;
  if (req.query.academicYear) query.academicYear = req.query.academicYear;

  if (!canManage(req.user.role)) {
    query.status = 'published';
  }

  if (req.user.role === 'student') {
    const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('classId sectionId subjects').lean();
    if (student) {
      query.classId = student.classId;
      if (student.sectionId) query.$or = [{ sectionId: student.sectionId }, { sectionId: { $exists: false } }, { sectionId: null }];
    }
  }

  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('children').lean();
    const children = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] } }).select('classId sectionId').lean();
    if (children.length) {
      query.classId = { $in: children.map((child) => child.classId).filter(Boolean) };
    }
  }

  return query;
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    const query = await buildVisibilityQuery(req);
    const syllabus = await Syllabus.find(query)
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .populate('subjectId', 'name code')
      .populate('createdBy', 'name')
      .populate('publishedBy', 'name')
      .sort({ academicYear: -1, createdAt: -1 })
      .lean();
    res.json({ syllabus });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load syllabus', error });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only academic roles can create syllabus.' });
    const item = await Syllabus.create({
      title: req.body.title,
      classId: req.body.classId,
      sectionId: req.body.sectionId || undefined,
      subjectId: req.body.subjectId || undefined,
      academicYear: req.body.academicYear || String(new Date().getFullYear()),
      term: req.body.term || 'full_year',
      objectives: req.body.objectives || '',
      chapters: Array.isArray(req.body.chapters) && req.body.chapters.length ? req.body.chapters : [{ title: 'Chapter 1', topics: '', weeks: '', marks: 0 }],
      instructions: req.body.instructions || '',
      attachmentUrl: req.body.attachmentUrl || '',
      status: req.body.status === 'published' ? 'published' : 'draft',
      institutionId: req.user.institutionId,
      createdBy: req.user._id,
      publishedBy: req.body.status === 'published' ? req.user._id : undefined,
      publishedAt: req.body.status === 'published' ? new Date() : undefined,
    });
    res.status(201).json({ syllabus: item });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create syllabus', error });
  }
});

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only academic roles can update syllabus.' });
    const update: any = {
      title: req.body.title,
      classId: req.body.classId,
      sectionId: req.body.sectionId || undefined,
      subjectId: req.body.subjectId || undefined,
      academicYear: req.body.academicYear,
      term: req.body.term,
      objectives: req.body.objectives,
      chapters: req.body.chapters,
      instructions: req.body.instructions,
      attachmentUrl: req.body.attachmentUrl,
    };
    if (req.body.status) {
      update.status = req.body.status;
      if (req.body.status === 'published') {
        update.publishedBy = req.user._id;
        update.publishedAt = new Date();
      }
    }
    Object.keys(update).forEach((key) => update[key] === undefined && delete update[key]);
    const item = await Syllabus.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, { $set: update }, { new: true });
    if (!item) return res.status(404).json({ message: 'Syllabus not found' });
    res.json({ syllabus: item });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update syllabus', error });
  }
});

router.patch('/:id/publish', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only academic roles can publish syllabus.' });
    const status = req.body.status === 'draft' || req.body.isPublished === false ? 'draft' : 'published';
    const item = await Syllabus.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { $set: { status, publishedBy: status === 'published' ? req.user._id : undefined, publishedAt: status === 'published' ? new Date() : undefined } },
      { new: true }
    );
    if (!item) return res.status(404).json({ message: 'Syllabus not found' });
    res.json({ syllabus: item });
  } catch (error) {
    res.status(500).json({ message: 'Failed to publish syllabus', error });
  }
});

router.delete('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only academic roles can delete syllabus.' });
    const item = await Syllabus.findOneAndDelete({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!item) return res.status(404).json({ message: 'Syllabus not found' });
    res.json({ message: 'Syllabus deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete syllabus', error });
  }
});

export default router;
