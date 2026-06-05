import express from 'express';
import { authenticate } from '../middleware/auth';
import Attendance from '../models/Attendance';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';

const router = express.Router();
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher', 'assistant_head', 'head'];
const staffRoles = ['staff', 'finance_officer', 'librarian'];

const monthRange = (monthValue: any, yearValue: any) => {
  const month = Number(monthValue) || new Date().getMonth() + 1;
  const year = Number(yearValue) || new Date().getFullYear();
  return { month, year, start: new Date(year, month - 1, 1), end: new Date(year, month, 1) };
};

const summary = (attendance: any[]) => {
  const working = attendance.filter((item) => item.status !== 'holiday');
  const present = attendance.filter((item) => item.status === 'present').length;
  const late = attendance.filter((item) => item.status === 'late').length;
  const leave = attendance.filter((item) => item.status === 'leave').length;
  const absent = attendance.filter((item) => item.status === 'absent').length;
  return {
    total: attendance.length,
    workingDays: working.length,
    present,
    late,
    leave,
    absent,
    holiday: attendance.filter((item) => item.status === 'holiday').length,
    absentPenaltyDays: absent,
    percentage: working.length ? Math.round((present / working.length) * 100) : 0,
  };
};

router.get('/me', authenticate, async (req: any, res) => {
  try {
    const institutionId = req.user.institutionId;
    const { month, year, start, end } = monthRange(req.query.month, req.query.year);
    const dateQuery = { $gte: start, $lt: end };

    if (req.user.role === 'student') {
      const student = await Student.findOne({ institutionId, userId: req.user._id }).populate('userId', 'name avatar email role').populate('classId', 'name grade').populate('sectionId', 'name').lean();
      if (!student) return res.status(404).json({ message: 'Student profile not found.' });
      const attendance = await Attendance.find({ institutionId, studentId: student._id, userType: 'student', date: dateQuery }).sort({ date: 1 }).lean();
      return res.json({ attendance, profile: student, personType: 'student', month, year, summary: summary(attendance) });
    }

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ institutionId, userId: req.user._id }).lean();
      const childIds = (parent?.children || []).map(String);
      const selectedChild = req.query.studentId ? String(req.query.studentId) : childIds[0];
      if (!selectedChild || !childIds.includes(selectedChild)) return res.status(403).json({ message: 'Access denied. Child is not linked to this parent account.' });
      const student = await Student.findOne({ institutionId, _id: selectedChild }).populate('userId', 'name avatar email role').populate('classId', 'name grade').populate('sectionId', 'name').lean();
      if (!student) return res.status(404).json({ message: 'Child student profile not found.' });
      const attendance = await Attendance.find({ institutionId, studentId: student._id, userType: 'student', date: dateQuery }).sort({ date: 1 }).lean();
      return res.json({ attendance, profile: student, children: childIds, personType: 'student', month, year, summary: summary(attendance) });
    }

    if (teacherRoles.includes(req.user.role)) {
      const teacher = await Teacher.findOne({ institutionId, userId: req.user._id }).populate('userId', 'name avatar email role').lean();
      const attendance = await Attendance.find({ institutionId, userId: req.user._id, userType: 'teacher', date: dateQuery }).sort({ date: 1 }).lean();
      return res.json({ attendance, profile: teacher || { name: req.user.name, role: req.user.role }, personType: 'teacher', employeeType: 'teacher', month, year, summary: summary(attendance) });
    }

    if (staffRoles.includes(req.user.role)) {
      const staff = await Staff.findOne({ institutionId, userId: req.user._id }).populate('userId', 'name avatar email role').lean();
      const attendance = await Attendance.find({ institutionId, userId: req.user._id, userType: 'staff', date: dateQuery }).sort({ date: 1 }).lean();
      return res.json({ attendance, profile: staff || { name: req.user.name, role: req.user.role }, personType: 'staff', employeeType: 'staff', month, year, summary: summary(attendance) });
    }

    return res.status(403).json({ message: 'This role cannot access my attendance.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load my attendance', error });
  }
});

export default router;
