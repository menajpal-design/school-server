import express from 'express';
import { authenticate, authorize } from '../middleware/auth';
import LeaveApplication from '../models/LeaveApplication';
import Student from '../models/Student';
import Attendance from '../models/Attendance';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import { resolveActorScope } from '../services/permissionPolicy';

const router = express.Router();
const approvalRoles = ['head', 'assistant_head', 'class_teacher', 'admin', 'super_admin'];
const applicantRoles = ['student', 'parent', 'teacher', 'subject_teacher', 'class_teacher', 'staff', 'finance_officer', 'librarian'];
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];
const staffRoles = ['staff', 'finance_officer', 'librarian'];

const parseDateOnly = (value?: string) => {
  if (!value) return new Date();
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};
const toDateValue = (value?: string) => { const date = parseDateOnly(value); return new Date(date.getFullYear(), date.getMonth(), date.getDate()); };
const countDays = (start: Date, end: Date) => Math.max(1, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
const idOf = (value: any) => String(value?._id || value || '');

const populateLeave = () => LeaveApplication.find()
  .populate({ path: 'studentId', populate: { path: 'userId', select: 'name email avatar' } })
  .populate('userId', 'name email avatar role')
  .populate('classId', 'name grade')
  .populate('sectionId', 'name')
  .populate('approvedBy', 'name role')
  .populate('reviewedBy', 'name role');

const buildDateList = (start: Date, end: Date) => {
  const dates: Date[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const finish = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (current <= finish) { dates.push(new Date(current)); current.setDate(current.getDate() + 1); }
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

const getAssignedClassIds = async (req: any) => {
  if (req.user.role !== 'class_teacher') return [];
  const scope = await resolveActorScope(req.user);
  return scope.assignedClassIds.map(String);
};

const canReviewLeave = async (req: any, leave: any) => {
  if (idOf(leave.userId) === idOf(req.user._id)) return false;
  if (['head', 'assistant_head', 'admin', 'super_admin'].includes(req.user.role)) return true;
  if (req.user.role !== 'class_teacher') return false;
  if (leave.applicantType !== 'student' && leave.applicantType !== 'parent') return false;
  const assignedClassIds = await getAssignedClassIds(req);
  return assignedClassIds.includes(idOf(leave.classId));
};

const markStudentLeaveAttendance = async (req: any, leave: any, status: string, dates: Date[]) => {
  const student: any = leave.studentId;
  if (!student?._id) return;
  if (status === 'approved') {
    for (const date of dates) {
      await Attendance.findOneAndUpdate(
        { institutionId: req.user.institutionId, studentId: student._id, date },
        { institutionId: req.user.institutionId, studentId: student._id, userId: student.userId, userType: 'student', classId: student.classId, sectionId: student.sectionId, date, status: 'leave', notes: `Approved leave: ${leave.reason}`, markedBy: req.user._id, markedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  } else {
    await Attendance.deleteMany({ institutionId: req.user.institutionId, studentId: student._id, date: { $in: dates }, status: 'leave' });
  }
};

const markEmployeeLeaveAttendance = async (req: any, leave: any, status: string, dates: Date[]) => {
  const userType = leave.employeeType === 'teacher' ? 'teacher' : 'staff';
  const employeeModel = userType === 'teacher' ? Teacher : Staff;
  const employee = await (employeeModel as any).findOne({ institutionId: req.user.institutionId, userId: leave.userId }).select('_id userId').lean();
  const employeeId = employee?._id;
  if (status === 'approved') {
    for (const date of dates) {
      await Attendance.findOneAndUpdate(
        { institutionId: req.user.institutionId, userId: leave.userId, userType, date },
        { institutionId: req.user.institutionId, userId: leave.userId, employeeId, userType, employeeType: userType, date, status: 'leave', notes: `Approved leave: ${leave.reason}`, markedBy: req.user._id, markedAt: new Date() },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  } else {
    await Attendance.deleteMany({ institutionId: req.user.institutionId, userId: leave.userId, userType, date: { $in: dates }, status: 'leave' });
  }
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
      const endBase = req.query.endDate ? toDateValue(String(req.query.endDate)) : new Date(2999, 0, 1);
      const end = new Date(endBase.getFullYear(), endBase.getMonth(), endBase.getDate() + 1);
      query.startDate = { $lt: end };
      query.endDate = { $gte: start };
    }

    if (req.user.role === 'class_teacher') {
      const assignedClassIds = await getAssignedClassIds(req);
      query.$or = [{ classId: { $in: assignedClassIds } }, { userId: req.user._id }];
      if (!req.query.status) query.status = 'pending';
    } else if (!approvalRoles.includes(req.user.role)) {
      if ([...teacherRoles, ...staffRoles].includes(req.user.role)) query.userId = req.user._id;
      else {
        const ownIds = await getOwnStudentIds(req);
        query.studentId = { $in: ownIds };
      }
    }

    const leaves = await populateLeave().where(query).sort({ createdAt: -1 }).lean();
    res.json({ leaves });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load leave applications', error });
  }
});

router.post('/', async (req: any, res) => {
  try {
    if (!applicantRoles.includes(req.user.role)) return res.status(403).json({ message: 'This role cannot apply for leave.' });
    const startDate = toDateValue(req.body.startDate);
    const endDate = toDateValue(req.body.endDate || req.body.startDate);
    if (endDate < startDate) return res.status(400).json({ message: 'End date cannot be before start date.' });
    if (!req.body.reason || String(req.body.reason).trim().length < 5) return res.status(400).json({ message: 'Leave reason is required.' });

    if ([...teacherRoles, ...staffRoles].includes(req.user.role)) {
      const employeeType = teacherRoles.includes(req.user.role) ? 'teacher' : 'staff';
      const employee = employeeType === 'teacher'
        ? await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('_id').lean()
        : await Staff.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('_id').lean();
      const leave = await LeaveApplication.create({ userId: req.user._id, applicantType: employeeType, employeeType, startDate, endDate, totalDays: countDays(startDate, endDate), reason: String(req.body.reason || '').trim(), attachmentUrl: String(req.body.attachmentUrl || '').trim() || undefined, status: 'pending', institutionId: req.user.institutionId });
      const created = await populateLeave().where({ _id: leave._id, institutionId: req.user.institutionId }).findOne();
      return res.status(201).json({ leave: { ...(created as any)?.toObject?.() || created, employeeId: employee?._id }, message: 'Leave application submitted.' });
    }

    let student: any = null;
    if (req.user.role === 'parent') {
      if (!req.body.studentId) return res.status(400).json({ message: 'Please select a child for leave application.' });
      const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      const childIds = (parent?.children || []).map((id: any) => String(id));
      if (!childIds.includes(String(req.body.studentId))) return res.status(403).json({ message: 'Access denied. This child is not linked to your parent account.' });
      student = await Student.findOne({ _id: req.body.studentId, institutionId: req.user.institutionId, isActive: { $ne: false } });
    } else if (req.body.studentId) {
      student = await Student.findOne({ _id: req.body.studentId, institutionId: req.user.institutionId, userId: req.user._id, isActive: { $ne: false } });
    } else {
      student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id, isActive: { $ne: false } });
    }
    if (!student) return res.status(404).json({ message: 'Student profile not found for leave application.' });
    const leave = await LeaveApplication.create({ studentId: student._id, userId: student.userId, applicantType: req.user.role === 'parent' ? 'parent' : 'student', classId: student.classId, sectionId: student.sectionId, startDate, endDate, totalDays: countDays(startDate, endDate), reason: String(req.body.reason || '').trim(), attachmentUrl: String(req.body.attachmentUrl || '').trim() || undefined, guardianNote: String(req.body.guardianNote || '').trim() || undefined, status: 'pending', institutionId: req.user.institutionId });
    const created = await populateLeave().where({ _id: leave._id, institutionId: req.user.institutionId }).findOne();
    res.status(201).json({ leave: created, message: 'Leave application submitted.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit leave application', error });
  }
});

router.patch('/:id/review', authorize('admin', 'super_admin', 'head', 'assistant_head', 'class_teacher'), async (req: any, res) => {
  try {
    const status = req.body.status;
    if (!['approved', 'rejected', 'pending'].includes(status)) return res.status(400).json({ message: 'Invalid leave status.' });
    const leave: any = await LeaveApplication.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).populate('studentId');
    if (!leave) return res.status(404).json({ message: 'Leave application not found.' });
    if (!(await canReviewLeave(req, leave))) return res.status(403).json({ message: 'Access denied. You cannot review this leave.' });

    leave.status = status;
    leave.reviewNote = req.body.reviewNote || '';
    leave.reviewedBy = req.user._id;
    leave.reviewedAt = new Date();
    leave.rejectedReason = status === 'rejected' ? (req.body.rejectedReason || req.body.reviewNote || '') : undefined;
    leave.approvedBy = status === 'approved' ? req.user._id : undefined;
    leave.approvedAt = status === 'approved' ? new Date() : undefined;
    await leave.save();

    const leaveDates = buildDateList(leave.startDate, leave.endDate);
    if (leave.studentId) await markStudentLeaveAttendance(req, leave, status, leaveDates);
    else await markEmployeeLeaveAttendance(req, leave, status, leaveDates);

    const updated = await populateLeave().where({ _id: leave._id, institutionId: req.user.institutionId }).findOne();
    res.json({ leave: updated, message: status === 'approved' ? 'Leave approved and attendance marked as leave.' : status === 'rejected' ? 'Leave rejected.' : 'Leave returned to pending.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to review leave application', error });
  }
});

export default router;
