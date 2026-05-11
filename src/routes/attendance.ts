import express from 'express';
import { authenticate, canManageAcademic } from '../middleware/auth';
import Attendance from '../models/Attendance';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import IDCard from '../models/IDCard';

const router = express.Router();

const dayRange = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return { start, end };
};

const toDateValue = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const statusSummary = (records: any[]) => ({
  total: records.length,
  present: records.filter((item) => item.status === 'present').length,
  absent: records.filter((item) => item.status === 'absent').length,
  late: records.filter((item) => item.status === 'late').length,
  leave: records.filter((item) => item.status === 'leave').length,
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
          percentage: { $cond: [{ $gt: ['$total', 0] }, { $round: [{ $multiply: [{ $divide: ['$present', '$total'] }, 100] }, 0] }, 0] },
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
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    today: statusSummary(todayRecords),
    classWise,
    trend: trend.map((item) => ({
      date: item._id,
      total: item.total,
      present: item.present,
      absent: item.absent,
      late: item.late,
      percentage: item.total ? Math.round((item.present / item.total) * 100) : 0,
    })),
  };
};

router.get('/', authenticate, canManageAcademic(), (req, res) => {
  const { start, end } = dayRange(req.query.date as string | undefined);
  const query: any = { institutionId: req.user.institutionId };
  if (req.query.classId) query.classId = req.query.classId;
  if (req.query.sectionId) query.sectionId = req.query.sectionId;
  if (req.query.userType) query.userType = req.query.userType;
  if (req.query.userId) query.userId = req.query.userId;
  if (req.query.date) query.date = { $gte: start, $lt: end };

  Attendance.find(query)
    .populate('studentId', 'rollNumber guardianName')
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

    for (const record of records) {
      const attendance = await Attendance.findOneAndUpdate(
        {
          studentId: record.studentId,
          userId: record.userId,
          userType: record.userType || (record.studentId ? 'student' : 'staff'),
          classId: record.classId || req.body.classId,
          sectionId: record.sectionId || req.body.sectionId,
          date: toDateValue(record.date || req.body.date),
          institutionId: req.user.institutionId,
        },
        {
          studentId: record.studentId,
          userId: record.userId,
          userType: record.userType || (record.studentId ? 'student' : 'staff'),
          classId: record.classId || req.body.classId,
          sectionId: record.sectionId || req.body.sectionId,
          date: toDateValue(record.date || req.body.date),
          status: record.status,
          notes: record.notes || '',
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId: req.user.institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      saved.push(attendance);
    }

    res.status(201).json({ attendance: saved });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark attendance', error });
  }
});

router.post('/scan-id-card', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const code = req.body.code || req.body.cardNumber || req.body.qrCodeData;
    if (!code) return res.status(400).json({ message: 'Card code required' });

    const card = await IDCard.findOne({
      institutionId: req.user.institutionId,
      $or: [{ cardNumber: code }, { qrCodeData: code }, { barcodeData: code }],
    });
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

router.get('/reports', authenticate, canManageAcademic(), (req, res) => {
  const startDate = req.query.startDate ? new Date(req.query.startDate as string) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const endSource = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
  const endDate = new Date(endSource.getFullYear(), endSource.getMonth(), endSource.getDate() + 1);
  const query: any = { institutionId: req.user.institutionId, date: { $gte: startDate, $lt: endDate } };
  if (req.query.classId) query.classId = req.query.classId;
  if (req.query.sectionId) query.sectionId = req.query.sectionId;
  if (req.query.personId) query.studentId = req.query.personId;
  if (req.query.userType) query.userType = req.query.userType;
  if (req.query.userId) query.userId = req.query.userId;

  Promise.all([
    Attendance.find(query)
      .populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email' } })
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ date: -1 })
      .lean(),
    Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$classId',
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          late: { $sum: { $cond: [{ $eq: ['$status', 'late'] }, 1, 0] } },
          leave: { $sum: { $cond: [{ $eq: ['$status', 'leave'] }, 1, 0] } },
        },
      },
      { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'class' } },
      { $unwind: { path: '$class', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$class.name', total: 1, present: 1, absent: 1, late: 1, leave: 1 } },
    ]),
    Attendance.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
          total: { $sum: 1 },
          present: { $sum: { $cond: [{ $eq: ['$status', 'present'] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ])
    .then(([records, comparison, trend]) => res.json({
      reports: records,
      comparison: comparison.map((item) => ({ ...item, percentage: item.total ? Math.round((item.present / item.total) * 100) : 0 })),
      trend: trend.map((item) => ({ date: item._id, total: item.total, present: item.present, percentage: item.total ? Math.round((item.present / item.total) * 100) : 0 })),
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
        attendance = await Attendance.find({ institutionId, studentId: student._id, date: { $gte: start, $lt: end } })
          .populate('classId', 'name grade')
          .populate('sectionId', 'name')
          .sort({ date: -1 })
          .lean();
        profile = { ...profile, rollNumber: student.rollNumber };
      } else if (req.user.role === 'parent') {
        const parent = await Parent.findOne({ institutionId, userId: req.user._id });
        const childIds = parent?.children || [];
        attendance = await Attendance.find({ institutionId, studentId: { $in: childIds }, date: { $gte: start, $lt: end } })
          .populate('classId', 'name grade')
          .populate('sectionId', 'name')
          .sort({ date: -1 })
          .lean();
      } else {
        const employee = await Teacher.findOne({ institutionId, userId: req.user._id }) || await Staff.findOne({ institutionId, userId: req.user._id });
        profile = { ...profile, employeeId: employee?.employeeId };
        attendance = await Attendance.find({ institutionId, userId: req.user._id, date: { $gte: start, $lt: end } })
          .sort({ date: -1 })
          .lean();
      }

      const summary = statusSummary(attendance);
      return res.json({ attendance, summary, profile, month, year });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load attendance', error }));
});

router.get('/students', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId, isActive: true };
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    const students = await Student.find(query)
      .populate('userId', 'name avatar email')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1 });
    res.json({ students });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load attendance students', error });
  }
});

export default router;
