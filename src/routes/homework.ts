import express from 'express';
import Homework from '../models/Homework';
import Student from '../models/Student';
import Parent from '../models/Parent';
import { authenticate, canManageAcademic } from '../middleware/auth';

const router = express.Router();

const isAcademicTeacherRole = (role?: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher'].includes(role || '');

const buildTeacherQuery = (req: any) => ({
  institutionId: req.user.institutionId,
});

router.get('/', authenticate, async (req: any, res) => {
  try {
    const role = req.user.role;

    if (isAcademicTeacherRole(role)) {
      const homework = await Homework.find(buildTeacherQuery(req))
        .populate('classId', 'name grade')
        .populate('createdBy', 'name email role')
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();
      return res.json({ homework });
    }

    if (role === 'student') {
      const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).select('classId').lean();
      if (!student?.classId) {
        return res.json({ homework: [] });
      }
      const homework = await Homework.find({ institutionId: req.user.institutionId, classId: student.classId, isPublished: true })
        .populate('classId', 'name grade')
        .populate('createdBy', 'name email role')
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();
      return res.json({ homework });
    }

    if (role === 'parent') {
      const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: true }).select('children').lean();
      const childIds = Array.isArray(parent?.children) ? parent.children : [];
      const students = await Student.find({ institutionId: req.user.institutionId, _id: { $in: childIds }, isActive: true }).select('classId').lean();
      const classIds = [...new Set(students.map((student) => String(student.classId)).filter(Boolean))];
      if (!classIds.length) {
        return res.json({ homework: [] });
      }
      const homework = await Homework.find({ institutionId: req.user.institutionId, classId: { $in: classIds }, isPublished: true })
        .populate('classId', 'name grade')
        .populate('createdBy', 'name email role')
        .sort({ dueDate: 1, createdAt: -1 })
        .lean();
      return res.json({ homework });
    }

    return res.json({ homework: [] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load homework', error });
  }
});

router.post('/', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const { title, description, subject, classId, dueDate } = req.body || {};

    if (!title || !String(title).trim()) {
      return res.status(400).json({ message: 'Title is required.' });
    }
    if (!classId) {
      return res.status(400).json({ message: 'Class is required.' });
    }
    if (!dueDate) {
      return res.status(400).json({ message: 'Due date is required.' });
    }

    const homework = await Homework.create({
      title: String(title).trim(),
      description: description ? String(description).trim() : undefined,
      subject: subject ? String(subject).trim() : undefined,
      classId,
      dueDate: new Date(dueDate),
      createdBy: req.user._id,
      institutionId: req.user.institutionId,
      isPublished: true,
    });

    const created = await Homework.findById(homework._id)
      .populate('classId', 'name grade')
      .populate('createdBy', 'name email role')
      .lean();

    res.status(201).json({ homework: created });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create homework', error });
  }
});

router.delete('/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const homework = await Homework.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    if (!['head', 'assistant_head'].includes(req.user.role) && String(homework.createdBy) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the owner or Head/Assistant Head can delete this homework.' });
    }

    await homework.deleteOne();
    res.json({ message: 'Homework deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete homework', error });
  }
});

export default router;
