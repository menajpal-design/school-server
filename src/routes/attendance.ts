import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageAcademic, canScanIDCard } from '../middleware/auth';
import Attendance from '../models/Attendance';
import Holiday from '../models/Holiday';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import IDCard from '../models/IDCard';
import Class from '../models/Class';
import Section from '../models/Section';
import User from '../models/User';
import { sendAttendanceDailySMS, sendAttendanceReminderSMS } from '../utils/sms';
import { resolveActorScope } from '../services/permissionPolicy';

const router = express.Router();

const parseDateOnly = (value?: string) => {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const dayRange = (value?: string) => {
  const date = parseDateOnly(value);
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
};

const toDateValue = (value?: string) => {
  const date = parseDateOnly(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const toObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

const statusSummary = (records: any[]) => ({
  total: records.length,
  present: records.filter((item) => item.status === 'present').length,
  absent: records.filter((item) => item.status === 'absent').length,
  late: records.filter((item) => item.status === 'late').length,
  leave: records.filter((item) => item.status === 'leave').length,
  holiday: records.filter((item) => item.status === 'holiday').length,
});

const buildAttendanceOverview = async (institutionId: any) => {
  const { start, end } = dayRange();
  const weekStart = new Date(start);
  weekStart.setDate(weekStart.getDate() - 6);

  const [todayRecords, classWise, trend] = await Promise.all([
    Attendance.find({ institutionId, date: { $gte: start, $lt: end } }).lean(),
    Attendance.aggregate([
      { $match: { institutionId, date: { $gte: start, $lt: end } } },
      {
        $group: {
          _id: '$classId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
          holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          classId: '$_id',
          className: '$class.name',
          total: 1,
          present: 1,
          absent: 1,
          late: 1,
          leave: 1,
          holiday: 1,
          attendanceTotal: { $subtract: ['$total', '$holiday'] },
          percentage: { $cond: [{ $gt: [{ $subtract: ['$total', '$holiday'] }, 0] }, { $round: [{ $multiply: [{ $divide: ['$present', { $subtract: ['$total', '$holiday'] }] }, 100] }, 0] }, 0] },
        },
      },
    ]),
    Attendance.aggregate([
      { $match: { institutionId, date: { $gte: weekStart, $lt: end } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    today: statusSummary(todayRecords),
    classWise,
    trend: trend.map((item) => {
      const attendanceTotal = Math.max(0, item.total - item.holiday);
      return { date: item._id, total: item.total, present: item.present, absent: item.absent, late: item.late, holiday: item.holiday, percentage: attendanceTotal ? Math.round((item.present / attendanceTotal) * 100) : 0 };
    }),
  };
};

const attendanceStudentQuery = async (req: any) => {
  const query: any = { institutionId: req.user.institutionId, isActive: true };
  if (req.user.role === 'student') {
    query.userId = req.user._id;
    return query;
  }
  if (req.user.role === 'parent') {
    const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
    query._id = { $in: parent?.children || [] };
    return query;
  }
  if (req.user.role === 'class_teacher') {
    const teacher: any = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
    query.classId = { $in: teacher?.assignedClasses || [] };
    const assignedSections = teacher?.assignedSections || teacher?.sectionIds || [];
    if (assignedSections.length) {
      query.sectionId = { $in: assignedSections };
    }
  }
  return query;
};

const canManageTeacherAttendance = (role: string) => ['head', 'assistant_head', 'admin', 'super_admin'].includes(role);

const employeeAttendanceQuery = (req: any) => ({
  institutionId: req.user.institutionId,
  isActive: true,
});

const normalizePersonType = (value: any) => String(value || 'student').toLowerCase();

const canMarkAttendanceRecords = async (req: any, records: any[]) => {
  const role = req.user.role;
  if (['admin', 'super_admin', 'head'].includes(role)) return true;

  const scope = await resolveActorScope(req.user);
  const isTeacher = ['teacher', 'class_teacher', 'subject_teacher'].includes(role);

  for (const record of records) {
    const userType = record.userType || (record.studentId ? 'student' : 'staff');
    if (userType === 'teacher' || (!record.studentId && record.userId)) {
      if (!canManageTeacherAttendance(role)) return false;
      continue;
    }

    if (userType === 'student' || record.studentId) {
      if (role === 'assistant_head' || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) continue;
      if (!isTeacher) return false;
      
      const classId = String(record.classId || req.body.classId || '');
      const sectionId = String(record.sectionId || req.body.sectionId || '');
      if (!scope.assignedClassIds.includes(classId)) return false;
      if (scope.assignedSectionIds.length > 0 && sectionId && !scope.assignedSectionIds.includes(sectionId)) return false;
    }
  }

  return true;
};

const notifyStudentAttendance = async (studentId: any, status: 'present' | 'absent' | 'late' | 'leave', institutionId: any) => {
  const student = await Student.findById(studentId).populate('userId', 'name').lean();
  if (!student || !student.guardianPhone) return;
  const studentName = (student as any).userId?.name || student.guardianName || 'Student';
  if (status === 'absent') {
    await sendAttendanceReminderSMS(student.guardianPhone, studentName, institutionId);
    return;
  }
  await sendAttendanceDailySMS(student.guardianPhone, studentName, status, institutionId);
};

const normalizeScanCode = (value: any) => String(value || '').trim();

const findStudentByScanCode = async (institutionId: any, code: string) => {
  const cleanCode = normalizeScanCode(code);
  if (!cleanCode) return null;

  const card = await IDCard.findOne({
    institutionId,
    ownerType: 'student',
    $or: [{ cardNumber: cleanCode }, { qrCodeData: cleanCode }, { barcodeData: cleanCode }],
  }).lean();

  if (card) {
    return Student.findOne({ institutionId, $or: [{ _id: card.ownerId }, { userId: card.ownerId }] })
      .populate('userId', 'name avatar email')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name');
  }

  const studentQuery: any[] = [
    { rollNumber: cleanCode },
    { idCardNumber: cleanCode },
  ];
  if (mongoose.Types.ObjectId.isValid(cleanCode)) {
    studentQuery.push({ _id: cleanCode }, { userId: cleanCode });
  }

  return Student.findOne({ institutionId, isActive: true, $or: studentQuery })
    .populate('userId', 'name avatar email')
    .populate('classId', 'name grade')
    .populate('sectionId', 'name');
};

router.get('/', authenticate, canManageAcademic(), async (req: any, res) => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const query: any = { institutionId: req.user.institutionId };
  
  const isTeacher = ['teacher', 'class_teacher', 'subject_teacher'].includes(req.user.role);
  if (isTeacher) {
    const scope = await resolveActorScope(req.user);
    const assignedClasses = scope.assignedClassIds.map(toObjectId);
    const assignedSections = scope.assignedSectionIds.map(toObjectId);
    
    if (req.query.classId) {
      if (!scope.assignedClassIds.includes(String(req.query.classId))) {
        return res.status(403).json({ message: 'Access denied. You can only view attendance for your assigned classes.' });
      }
      query.classId = toObjectId(req.query.classId);
    } else {
      query.classId = { $in: assignedClasses };
    }

    if (req.query.sectionId) {
      if (!scope.assignedSectionIds.includes(String(req.query.sectionId))) {
        return res.status(403).json({ message: 'Access denied. You can only view attendance for your assigned sections.' });
      }
      query.sectionId = toObjectId(req.query.sectionId);
    } else if (assignedSections.length > 0) {
      query.sectionId = { $in: assignedSections };
    }
  } else {
    if (req.query.classId) query.classId = toObjectId(req.query.classId);
    if (req.query.sectionId) query.sectionId = toObjectId(req.query.sectionId);
  }
  
  if (req.query.userType) query.userType = req.query.userType;
  if (req.query.userId) query.userId = toObjectId(req.query.userId);
  if (req.query.date) query.date = { $gte: start, $lt: end };

  Attendance.find(query)
    .populate('studentId', 'rollNumber guardianName')
    .populate('userId', 'name avatar email role')
    .populate('classId', 'name grade')
    .populate('sectionId', 'name')
    .sort({ date: -1 })
    .then((attendance) => res.json({ attendance }))
    .catch((error) => res.status(500).json({ message: 'Failed to load attendance', error }));
});

router.post('/mark', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : [req.body];
    const saved = [];
    const allowed = await canMarkAttendanceRecords(req, records);
    if (!allowed) return res.status(403).json({ message: 'Access denied. You cannot mark this attendance.' });

    for (const record of records) {
      const userType = record.userType || (record.studentId ? 'student' : 'staff');
      const dateValue = toDateValue(record.date || req.body.date);
      const finalStatus = record.status || req.body.status || 'present';
      const finalNotes = record.notes || req.body.notes || '';
      const attendance = await Attendance.findOneAndUpdate(
        {
          studentId: record.studentId,
          userId: record.userId,
          userType,
          classId: record.classId || req.body.classId,
          sectionId: record.sectionId || req.body.sectionId,
          date: dateValue,
          institutionId: req.user.institutionId,
        },
        {
          studentId: record.studentId,
          userId: record.userId,
          userType,
          classId: record.classId || req.body.classId,
          sectionId: record.sectionId || req.body.sectionId,
          date: dateValue,
          status: finalStatus,
          notes: finalNotes,
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId: req.user.institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(attendance);
      if (userType === 'student' && record.studentId) {
        await notifyStudentAttendance(record.studentId, finalStatus, req.user.institutionId);
      }
    }

    res.status(201).json({ attendance: saved });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark attendance', error });
  }
});

router.post('/scan-present', authenticate, canScanIDCard(), async (req, res) => {
  try {
    const code = normalizeScanCode(req.body.code || req.body.cardNumber || req.body.qrCodeData || req.body.barcodeData);
    if (!code) return res.status(400).json({ message: 'QR code or barcode required' });

    const student = await findStudentByScanCode(req.user.institutionId, code);
    if (!student) return res.status(404).json({ message: 'Student not found for scanned QR/barcode' });

    const record = {
      studentId: student._id,
      userType: 'student',
      classId: (student as any).classId?._id || (student as any).classId,
      sectionId: (student as any).sectionId?._id || (student as any).sectionId,
      status: 'present',
      date: req.body.date,
      notes: req.body.notes || `Present by ${req.body.scanMode || 'scanner'} scan`,
    };

    const allowed = await canMarkAttendanceRecords(req, [record]);
    if (!allowed) return res.status(403).json({ message: 'Access denied. You cannot mark this student attendance.' });

    const dateValue = toDateValue(req.body.date);
    const attendance = await Attendance.findOneAndUpdate(
      {
        studentId: record.studentId,
        userType: 'student',
        classId: record.classId,
        sectionId: record.sectionId,
        date: dateValue,
        institutionId: req.user.institutionId,
      },
      {
        ...record,
        date: dateValue,
        markedBy: req.user._id,
        markedAt: new Date(),
        institutionId: req.user.institutionId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await notifyStudentAttendance(record.studentId, 'present', req.user.institutionId);

    res.status(201).json({
      attendance,
      student,
      message: `${(student as any).userId?.name || 'Student'} marked present.`,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark present from scanner', error });
  }
});

router.post('/scan-id-card', authenticate, canScanIDCard(), async (req, res) => {
  try {
    const code = req.body.code || req.body.cardNumber || req.body.qrCodeData;
    if (!code) return res.status(400).json({ message: 'Card code required' });

    const card = await IDCard.findOne({ institutionId: req.user.institutionId, $or: [{ cardNumber: code }, { qrCodeData: code }, { barcodeData: code }] });
    if (!card) return res.status(404).json({ message: 'ID card not found' });

    if (card.ownerType === 'teacher') {
      const teacher = await Teacher.findOne({ institutionId: req.user.institutionId, userId: card.ownerId }).populate('userId', 'name avatar email');
      if (!teacher) return res.status(404).json({ message: 'Teacher not found for scanned card' });
      return res.json({ teacher, userType: 'teacher' });
    }

    if (card.ownerType === 'staff') {
      const staff = await Staff.findOne({ institutionId: req.user.institutionId, userId: card.ownerId }).populate('userId', 'name avatar email');
      if (!staff) return res.status(404).json({ message: 'Staff not found for scanned card' });
      return res.json({ staff, userType: 'staff' });
    }

    const student = await Student.findOne({ institutionId: req.user.institutionId, $or: [{ _id: card.ownerId }, { userId: card.ownerId }] })
      .populate('userId', 'name avatar email')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name');
    if (!student) return res.status(404).json({ message: 'Student not found for scanned card' });

    res.json({ student });
  } catch (error) {
    res.status(500).json({ message: 'Failed to scan ID card', error });
  }
});

router.get('/reports', authenticate, canManageAcademic(), async (req: any, res) => {
  const startDate = req.query.startDate ? parseDateOnly(req.query.startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endSource = req.query.endDate ? parseDateOnly(req.query.endDate as string) : new Date();
  const endDate = new Date(endSource.getFullYear(), endSource.getMonth(), endSource.getDate() + 1);
  const query: any = { institutionId: req.user.institutionId, date: { $gte: startDate, $lt: endDate } };
  
  const isTeacher = ['teacher', 'class_teacher', 'subject_teacher'].includes(req.user.role);
  if (isTeacher) {
    const scope = await resolveActorScope(req.user);
    const assignedClasses = scope.assignedClassIds;
    const assignedSections = scope.assignedSectionIds;

    if (req.query.classId) {
      const targetClass = String(req.query.classId);
      if (!assignedClasses.includes(targetClass)) {
        return res.status(403).json({ message: 'Access denied. You can only view reports for your assigned classes.' });
      }
      query.classId = toObjectId(targetClass);
    } else {
      query.classId = { $in: assignedClasses.map(toObjectId) };
    }

    if (req.query.sectionId) {
      const targetSection = String(req.query.sectionId);
      if (!assignedSections.includes(targetSection)) {
        return res.status(403).json({ message: 'Access denied. You can only view reports for your assigned sections.' });
      }
      query.sectionId = toObjectId(targetSection);
    } else if (assignedSections.length > 0) {
      query.sectionId = { $in: assignedSections.map(toObjectId) };
    }
  } else {
    if (req.query.classId) query.classId = toObjectId(req.query.classId);
    if (req.query.sectionId) query.sectionId = toObjectId(req.query.sectionId);
  }
  
  if (req.query.sectionId) query.sectionId = toObjectId(req.query.sectionId);
  if (req.query.personId) query.studentId = toObjectId(req.query.personId);
  if (req.query.personType === 'teacher' && req.query.personId) {
    delete query.studentId;
    query.userId = toObjectId(req.query.personId);
    query.userType = 'teacher';
  }
  if (req.query.userType) query.userType = req.query.userType;
  if (req.query.userId) query.userId = toObjectId(req.query.userId);

  Promise.all([
    Attendance.find(query)
      .populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email' } })
      .populate('userId', 'name avatar email role')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ date: -1 })
      .lean(),
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: '$classId', total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } }, late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } }, leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } }, holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } } } },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$class.name', total: 1, present: 1, absent: 1, late: 1, leave: 1, holiday: 1 } },
    ]),
    Attendance.aggregate([
      { $match: query },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }, total: { $sum: 1 }, present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } }, holiday: { $sum: { $cond: [{ $eq: ['$status', 'holiday'] }, 1, 0] } } } },
      { $sort: { _id: 1 } },
    ]),
  ])
    .then(([records, comparison, trend]) => res.json({
      reports: records,
      comparison: comparison.map((item) => {
        const attendanceTotal = Math.max(0, item.total - item.holiday);
        return { ...item, percentage: attendanceTotal ? Math.round((item.present / attendanceTotal) * 100) : 0 };
      }),
      trend: trend.map((item) => {
        const attendanceTotal = Math.max(0, item.total - item.holiday);
        return { date: item._id, total: item.total, present: item.present, holiday: item.holiday, percentage: attendanceTotal ? Math.round((item.present / attendanceTotal) * 100) : 0 };
      }),
    }))
    .catch((error) => res.status(500).json({ message: 'Failed to load attendance reports', error }));
});

router.get('/me', authenticate, (req, res) => {
  const institutionId = req.user.institutionId;
  const month = Number(req.query.month) || new Date().getMonth() + 1;
  const year = Number(req.query.year) || new Date().getFullYear();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1);

  Student.findOne({ institutionId, userId: req.user._id })
    .then(async (student) => {
      let attendance: any[] = [];
      let profile: any = { name: req.user.name, role: req.user.role };

      if (student) {
        attendance = await Attendance.find({ institutionId, studentId: student._id, date: { $gte: start, $lt: end } }).sort({ date: 1 }).lean();
        profile = student;
      } else if (['teacher', 'class_teacher', 'subject_teacher', 'assistant_head', 'head'].includes(req.user.role)) {
        const teacher = await Teacher.findOne({ institutionId, userId: req.user._id }).lean();
        profile = teacher || profile;
        attendance = await Attendance.find({ institutionId, userId: req.user._id, userType: 'teacher', date: { $gte: start, $lt: end } }).sort({ date: 1 }).lean();
      } else if (req.user.role === 'staff' || req.user.role === 'finance_officer') {
        const staff = await Staff.findOne({ institutionId, userId: req.user._id }).lean();
        profile = staff || profile;
        attendance = await Attendance.find({ institutionId, userId: req.user._id, userType: 'staff', date: { $gte: start, $lt: end } }).sort({ date: 1 }).lean();
      }

      res.json({ attendance, profile });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load my attendance', error }));
});

router.post('/me/mark', authenticate, async (req: any, res) => {
  try {
    const institutionId = req.user.institutionId;
    const dateValue = toDateValue(req.body.date);
    const finalStatus = req.body.status || 'present';
    const finalNotes = req.body.notes || 'Self-marked attendance';

    let attendance: any = null;

    const student = await Student.findOne({ institutionId, userId: req.user._id });
    if (student) {
      attendance = await Attendance.findOneAndUpdate(
        {
          studentId: student._id,
          userType: 'student',
          classId: student.classId,
          sectionId: student.sectionId,
          date: dateValue,
          institutionId,
        },
        {
          studentId: student._id,
          userType: 'student',
          classId: student.classId,
          sectionId: student.sectionId,
          date: dateValue,
          status: finalStatus,
          notes: finalNotes,
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else if (['teacher', 'class_teacher', 'subject_teacher', 'assistant_head', 'head'].includes(req.user.role)) {
      const teacher = await Teacher.findOne({ institutionId, userId: req.user._id });
      attendance = await Attendance.findOneAndUpdate(
        {
          userId: req.user._id,
          userType: 'teacher',
          date: dateValue,
          institutionId,
        },
        {
          userId: req.user._id,
          userType: 'teacher',
          date: dateValue,
          status: finalStatus,
          notes: finalNotes,
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else if (req.user.role === 'staff' || req.user.role === 'finance_officer') {
      const staff = await Staff.findOne({ institutionId, userId: req.user._id });
      attendance = await Attendance.findOneAndUpdate(
        {
          userId: req.user._id,
          userType: 'staff',
          date: dateValue,
          institutionId,
        },
        {
          userId: req.user._id,
          userType: 'staff',
          date: dateValue,
          status: finalStatus,
          notes: finalNotes,
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    } else {
      return res.status(403).json({ message: 'User role cannot mark attendance.' });
    }

    res.status(201).json({ attendance, message: 'Attendance marked successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to self-mark attendance', error });
  }
});

router.get('/people', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const personType = normalizePersonType(req.query.personType);
    if (personType === 'teacher') {
      const teachers = await Teacher.find(employeeAttendanceQuery(req))
        .populate('userId', 'name avatar email role phone username fingerprintId biometricId')
        .select('userId employeeId department designation isActive')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: teachers.map((teacher: any) => ({ ...teacher, _id: teacher.userId?._id || teacher.userId, profileId: teacher._id, personType: 'teacher' })) });
    }

    if (personType === 'staff') {
      const staff = await Staff.find(employeeAttendanceQuery(req))
        .populate('userId', 'name avatar email role phone username fingerprintId biometricId')
        .select('userId employeeId department designation isActive')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: staff.map((staffMember: any) => ({ ...staffMember, _id: staffMember.userId?._id || staffMember.userId, profileId: staffMember._id, personType: 'staff' })) });
    }

    if (personType === 'head') {
      const heads = await User.find({ institutionId: req.user.institutionId, role: 'head', isActive: true })
        .select('name avatar email role phone username fingerprintId biometricId')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: heads.map((user: any) => ({ ...user, _id: user._id, personType: 'teacher' })) });
    }

    if (personType === 'assistant_head') {
      const assistantHeads = await User.find({ institutionId: req.user.institutionId, role: 'assistant_head', isActive: true })
        .select('name avatar email role phone username fingerprintId biometricId')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: assistantHeads.map((user: any) => ({ ...user, _id: user._id, personType: 'teacher' })) });
    }

    if (personType === 'all_staff') {
      const [teachers, staff, users] = await Promise.all([
        Teacher.find(employeeAttendanceQuery(req)).populate('userId', 'name avatar email role phone username fingerprintId biometricId').lean(),
        Staff.find(employeeAttendanceQuery(req)).populate('userId', 'name avatar email role phone username fingerprintId biometricId').lean(),
        User.find({ institutionId: req.user.institutionId, role: { $in: ['head', 'assistant_head'] }, isActive: true }).select('name avatar email role phone username fingerprintId biometricId').lean()
      ]);

      const list: any[] = [];
      teachers.forEach((t: any) => {
        if (t.userId) {
          list.push({ ...t, _id: t.userId._id || t.userId, profileId: t._id, personType: 'teacher' });
        }
      });
      staff.forEach((s: any) => {
        if (s.userId) {
          list.push({ ...s, _id: s.userId._id || s.userId, profileId: s._id, personType: 'staff' });
        }
      });
      users.forEach((u: any) => {
        list.push({ ...u, _id: u._id, personType: u.role === 'assistant_head' ? 'teacher' : 'staff' });
      });

      return res.json({ people: list });
    }

    const query = await attendanceStudentQuery(req);
    if (req.query.classId) {
      if (req.user.role === 'class_teacher') {
        const teacher: any = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
        const assignedClasses = (teacher?.assignedClasses || []).map(String);
        if (!assignedClasses.includes(String(req.query.classId))) {
          return res.status(403).json({ message: 'Access denied. You can only view people from your assigned classes.' });
        }
      }
      query.classId = req.query.classId;
    }
    if (req.query.sectionId) {
      if (req.user.role === 'class_teacher') {
        const teacher: any = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
        const assignedSections = (teacher?.assignedSections || teacher?.sectionIds || []).map(String);
        if (!assignedSections.includes(String(req.query.sectionId))) {
          return res.status(403).json({ message: 'Access denied. You can only view people from your assigned sections.' });
        }
      }
      query.sectionId = req.query.sectionId;
    }
    const students = await Student.find(query)
      .populate('userId', 'name avatar email')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1 })
      .lean();

    let lockedClassId: string | undefined;
    if (req.user.role === 'class_teacher') {
      const teacher: any = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      const assignedClasses = teacher?.assignedClasses || [];
      if (assignedClasses.length === 1) {
        lockedClassId = String(assignedClasses[0]);
      }
    }

    res.json({ people: students, lockedClassId });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendance people', error });
  }
});

router.get('/student/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
    if (!student) return res.status(404).json({ message: 'Student not found' });
    if (req.user.role === 'class_teacher') {
      const teacher: any = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
      const assignedClasses = (teacher?.assignedClasses || []).map(String);
      const assignedSections = (teacher?.assignedSections || teacher?.sectionIds || []).map(String);
      if (!assignedClasses.includes(String(student.classId))) {
        return res.status(403).json({ message: 'Access denied. Student is not in your assigned class.' });
      }
      if (assignedSections.length > 0 && student.sectionId && !assignedSections.includes(String(student.sectionId))) {
        return res.status(403).json({ message: 'Access denied. Student is not in your assigned section.' });
      }
    }
    const attendance = await Attendance.find({ institutionId: req.user.institutionId, studentId: student._id }).sort({ date: 1 }).lean();
    res.json({ attendance, student });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load student attendance history', error });
  }
});

router.get('/person/:type/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const personType = normalizePersonType(req.params.type);
    if (!['teacher', 'staff'].includes(personType)) return res.status(400).json({ message: 'Invalid person type' });
    const attendance = await Attendance.find({ institutionId: req.user.institutionId, userId: req.params.id, userType: personType }).sort({ date: 1 }).lean();
    res.json({ attendance });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load person attendance history', error });
  }
});

router.get('/overview', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const overview = await buildAttendanceOverview(req.user.institutionId);
    res.json({ overview });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendance overview', error });
  }
});

export default router;