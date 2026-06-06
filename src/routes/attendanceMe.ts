import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
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
  return { total: attendance.length, workingDays: working.length, present, late, leave, absent, holiday: attendance.filter((item) => item.status === 'holiday').length, absentPenaltyDays: absent, percentage: working.length ? Math.round((present / working.length) * 100) : 0 };
};
const ids = (items: any[] = []) => items.map((item) => String(item?._id || item)).filter(Boolean);

router.get('/people', authenticate, async (req: any, res) => {
  try {
    const institutionId = req.user.institutionId;
    const role = normalizeRole(req.user.role);
    const personType = String(req.query.personType || 'student').toLowerCase();

    if (personType === 'teacher') {
      if (!['head', 'assistant_head', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Only school leaders can load teacher attendance roster.' });
      const people = await Teacher.find({ institutionId, isActive: { $ne: false } }).populate('userId', 'name username email phone avatar role').sort({ createdAt: -1 }).lean();
      return res.json({ people });
    }

    if (personType === 'staff') {
      if (!['head', 'assistant_head', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Only school leaders can load staff attendance roster.' });
      const people = await Staff.find({ institutionId, isActive: { $ne: false } }).populate('userId', 'name username email phone avatar role').sort({ createdAt: -1 }).lean();
      return res.json({ people });
    }

    const query: any = { institutionId, isActive: true };
    let lockedClassId = '';
    let lockedClassIds: string[] = [];
    if (role === 'class_teacher') {
      const teacher: any = await Teacher.findOne({ institutionId, userId: req.user._id, isActive: { $ne: false } }).select('assignedClasses assignedSections sectionIds').lean();
      lockedClassIds = ids(teacher?.assignedClasses || []);
      if (!lockedClassIds.length) return res.json({ people: [], lockedClassId: '', lockedClassIds: [], message: 'No assigned class found for this class teacher.' });
      const requested = String(req.query.classId || '');
      lockedClassId = lockedClassIds.includes(requested) ? requested : lockedClassIds[0];
      query.classId = lockedClassId;
      const sectionIds = ids(teacher?.assignedSections || teacher?.sectionIds || []);
      if (sectionIds.length) query.sectionId = { $in: sectionIds };
      else if (req.query.sectionId) query.sectionId = req.query.sectionId;
    } else {
      if (req.query.classId) query.classId = req.query.classId;
      if (req.query.sectionId) query.sectionId = req.query.sectionId;
    }

    const people = await Student.find(query)
      .populate('userId', 'name username email phone avatar role')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1, createdAt: 1 })
      .lean();
    res.json({ people, lockedClassId, lockedClassIds });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendance people', error });
  }
});

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
      const childIds = ids(parent?.children || []);
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
