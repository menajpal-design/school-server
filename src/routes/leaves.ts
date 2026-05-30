import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import LeaveApplication from '../models/LeaveApplication';
import Student from '../models/Student';
import Attendance from '../models/Attendance';
import Parent from '../models/Parent';

const router = express.Router();
const approvalRoles = ['head', 'assistant_head', 'admin', 'super_admin'];

const parseDateOnly = (value?: string) => {
  if (!value) return new Date();
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const toDateValue = (value?: string) => {
  const date = parseDateOnly(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const countDays = (start: Date, end: Date) => {
  const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(1, diff + 1);
};

const populateLeave = () => LeaveApplication.find()
  .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email avatar' } })
  .populate('userId', 'name email avatar role')
  .populate('classId', 'name grade')
  .populate('sectionId', 'name')
  .populate('reviewedBy', 'name role');

const buildDateList = (start: Date, end: Date) => {
  const dates: Date[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finish = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (current <= finish) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
};

const getOwnStudentIds = async (req: any) => {
  if (req.user.role === 'student') {
    const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('_id').lean();
    return student ? [student._id] : [];
  }
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
    return parent?.children || [];
  }
  return [];
};

router.use(authenticate);

router.get('/', async (req: any, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.status) query.status = req.query.status;
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    if (req.query.studentId) query.studentId = req.query.studentId;
    if (req.query.startDate || req.query.endDate) {
      const start = req.query.startDate ? toDateValue(String(req.query.startDate)) : new Date(2000, 0, 1);
      const end = req.query.endDate ? new Date(toDateValue(String(req.query.endDate)).getFullYear(), toDateValue(String(req.query.endDate)).getMonth(), toDateValue(String(req.query.endDate)).getDate() + 1) : new Date(2999, 0, 1);
      query.startDate = { $lt: end };
      query.endDate = { $gte: start };
    }

    if (!approvalRoles.includes(req.user.role)) {
      const ownIds = await getOwnStudentIds(req);
      query.studentId = { $in: ownIds };
    }

    const leaves = await populateLeave().where(query).sort({ createdAt: -1 }).lean();
    res.json({ leaves });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load leave applications', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    if (!['student', 'parent', 'head', 'assistant_head', 'admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only students/parents can apply for leave.' });
    }

    let student: any = null;
    if (req.body.studentId) {
      const query: any = { _id: req.body.studentId, institutionId: req.user.institutionId };
      if (req.user.role === 'student') query.userId = req.user._id;
      if (req.user.role === 'parent') {
        const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
        query._id = { $in: parent?.children || [] };
      }
      student = await Student.findOne(query);
    } else {
      student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id });
    }

    if (!student) return res.status(404).json({ message: 'Student profile not found for leave application.' });

    const startDate = toDateValue(req.body.startDate);
    const endDate = toDateValue(req.body.endDate || req.body.startDate);
    if (endDate < startDate) return res.status(400).json({ message: 'End date cannot be before start date.' });
    if (!req.body.reason || String(req.body.reason).trim().length < 5) return res.status(400).json({ message: 'Leave reason is required.' });

    const leave = await LeaveApplication.create({
      studentId: student._id,
      userId: student.userId,
      classId: student.classId,
      sectionId: student.sectionId,
      startDate,
      endDate,
      totalDays: countDays(startDate, endDate),
      reason: req.body.reason,
      guardianNote: req.body.guardianNote,
      status: approvalRoles.includes(req.user.role) && req.body.status === 'approved' ? 'approved' : 'pending',
      reviewedBy: approvalRoles.includes(req.user.role) && req.body.status === 'approved' ? req.user._id : undefined,
      reviewedAt: approvalRoles.includes(req.user.role) && req.body.status === 'approved' ? new Date() : undefined,
      institutionId: req.user.institutionId,
    });

    if (leave.status === 'approved') {
      for (const date of buildDateList(startDate, endDate)) {
        await Attendance.findOneAndUpdate(
          { institutionId: req.user.institutionId, studentId: student._id, date },
          { institutionId: req.user.institutionId, studentId: student._id, userId: student.userId, userType: 'student', classId: student.classId, sectionId: student.sectionId, date, status: 'leave', notes: `Approved leave: ${leave.reason}`, markedBy: req.user._id, markedAt: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    const created = await populateLeave().where({ _id: leave._id }).findOne();
    res.status(201).json({ leave: created, message: leave.status === 'approved' ? 'Leave approved and attendance marked as leave.' : 'Leave application submitted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit leave application', error });
  }
});

router.patch('/:id/review', authorize('admin', 'super_admin', 'head', 'assistant_head'), async (req: any, res) => {
  try {
    const status = req.body.status;
    if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ message: 'Invalid leave status.' });
    const leave: any = await LeaveApplication.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).populate('studentId');
    if (!leave) return res.status(404).json({ message: 'Leave application not found.' });

    leave.status = status;
    leave.reviewNote = req.body.reviewNote || '';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    await leave.save();

    if (status === 'approved') {
      const student: any = leave.studentId;
      for (const date of buildDateList(leave.startDate, leave.endDate)) {
        await Attendance.findOneAndUpdate(
          { institutionId: req.user.institutionId, studentId: student._id, date },
          { institutionId: req.user.institutionId, studentId: student._id, userId: student.userId, userType: 'student', classId: student.classId, sectionId: student.sectionId, date, status: 'leave', notes: `Approved leave: ${leave.reason}`, markedBy: req.user._id, markedAt: new Date() },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    const updated = await populateLeave().where({ _id: leave._id }).findOne();
    res.json({ leave: updated, message: status === 'approved' ? 'Leave approved and attendance marked as leave.' : status === 'rejected' ? 'Leave rejected.' : 'Leave returned to pending.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to review leave application', error });
  }
});

export default router;
