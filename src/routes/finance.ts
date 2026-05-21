import express from 'express';
import { authenticate, canManageFinance } from '../middleware/auth';
import Fee from '../models/Fee';
import Payment from '../models/Payment';
import Salary from '../models/Salary';
import Student from '../models/Student';
import Parent from '../models/Parent';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import IDCard from '../models/IDCard';
import Attendance from '../models/Attendance';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();

const receiptNumber = () => `RCPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
const objectIdOrUndefined = (value: any) => String(value || '').trim() || undefined;
const normalizeFeePayload = (body: any) => {
  const payload: any = { ...body };
  payload.studentId = objectIdOrUndefined(payload.studentId);
  payload.classId = objectIdOrUndefined(payload.classId);
  payload.type = payload.type || 'monthly';
  payload.year = Number(payload.year || new Date().getFullYear());
  payload.month = payload.type === 'monthly' ? 'All Months' : String(payload.month || 'N/A');
  payload.dueDate = payload.dueDate || new Date(payload.year, 0, 10);
  if (payload.studentId === undefined) delete payload.studentId;
  if (payload.classId === undefined) delete payload.classId;
  return payload;
};

const calculateFeeAmount = (body: any) => {
  const originalAmount = Number(body.originalAmount ?? body.baseAmount ?? body.amount ?? 0);
  const waiverType = body.waiverType || 'none';
  const requestedWaiver = Number(body.waiverAmount || body.scholarship || body.discount || 0);
  const waiverAmount = waiverType === 'free'
    ? originalAmount
    : waiverType === 'half'
      ? originalAmount / 2
      : waiverType === 'partial'
        ? requestedWaiver
        : requestedWaiver;

  const cappedWaiver = Math.min(originalAmount, Math.max(0, waiverAmount));
  return {
    originalAmount,
    waiverType,
    waiverAmount: cappedWaiver,
    amount: Math.max(0, originalAmount - cappedWaiver),
  };
};

const monthRange = (month?: string, year?: number) => {
  const monthIndex = month ? new Date(`${month} 1, ${year || new Date().getFullYear()}`).getMonth() : new Date().getMonth();
  const y = year || new Date().getFullYear();
  return { start: new Date(y, monthIndex, 1), end: new Date(y, monthIndex + 1, 1) };
};

const populateFee = () =>
  Fee.find()
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email' } })
    .populate('classId', 'name grade')
    .populate('collectedBy', 'name');

const populatePayment = () =>
  Payment.find()
    .populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email' } })
    .populate('feeId', 'type month year amount')
    .populate('collectedBy', 'name');

const normalizePaymentAmount = (value: any) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};

const collectFeePayment = async (req: any, source: 'payment' | 'collection') => {
  const fee = req.body.feeId
    ? await Fee.findOne({ _id: req.body.feeId, institutionId: req.user.institutionId })
    : await Fee.findOne({ studentId: req.body.studentId, institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } }).sort({ dueDate: 1 });

  if (!fee) {
    return { status: 404, body: { message: source === 'payment' ? 'No due fee found for payment' : 'No due fee found for collection' } };
  }

  const payableAmount = normalizePaymentAmount(fee.amount);
  const paidAmount = normalizePaymentAmount(req.body.amount);

  if (paidAmount <= 0) {
    return { status: 400, body: { message: 'Enter a valid payment amount.' } };
  }

  if (paidAmount > payableAmount) {
    return { status: 400, body: { message: 'Payment amount cannot be greater than due amount.', dueAmount: payableAmount } };
  }

  const paymentMethod = req.body.paymentMethod || 'cash';
  const payment = await Payment.create({
    feeId: fee._id,
    studentId: req.body.studentId || fee.studentId,
    amount: paidAmount,
    paymentMethod,
    paymentDate: new Date(),
    collectedBy: req.user._id,
    notes: req.body.notes,
    receiptNumber: receiptNumber(),
    institutionId: req.user.institutionId,
  });

  const remainingAmount = normalizePaymentAmount(payableAmount - paidAmount);
  fee.amount = remainingAmount;
  fee.status = remainingAmount <= 0 ? 'paid' : 'pending';
  fee.paidDate = fee.status === 'paid' ? new Date() : undefined;
  fee.paymentMethod = paymentMethod;
  fee.transactionId = undefined;
  await fee.save();

  const created = await populatePayment().where({ _id: payment._id, institutionId: req.user.institutionId }).findOne();
  await writeAuditLog(req, 'create', source, payment._id, created);
  return { status: 201, body: { payment: created } };
};

const buildSummary = async (institutionId: any) => {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [collections, dues, todayCollections, salary, pendingPayments, monthlyTrend, recentPayments] = await Promise.all([
    Payment.aggregate([{ $match: { institutionId } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Fee.aggregate([{ $match: { institutionId, status: { $in: ['pending', 'overdue'] } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Payment.aggregate([{ $match: { institutionId, paymentDate: { $gte: startOfDay, $lt: endOfDay } } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
    Salary.aggregate([{ $match: { institutionId, paymentDate: { $gte: startOfMonth, $lt: endOfMonth } } }, { $group: { _id: null, total: { $sum: '$netSalary' } } }]),
    Fee.countDocuments({ institutionId, status: { $in: ['pending', 'overdue'] } }),
    Payment.aggregate([
      { $match: { institutionId, paymentDate: { $gte: new Date(now.getFullYear(), now.getMonth() - 11, 1), $lt: endOfMonth } } },
      { $group: { _id: { year: { $year: '$paymentDate' }, month: { $month: '$paymentDate' } }, total: { $sum: '$amount' } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),
    populatePayment().where({ institutionId }).sort({ paymentDate: -1 }).limit(8).lean(),
  ]);
  return {
    totalCollection: collections[0]?.total || 0,
    totalDue: dues[0]?.total || 0,
    todayCollection: todayCollections[0]?.total || 0,
    monthlySalary: salary[0]?.total || 0,
    pendingPayments,
    monthlyTrend: monthlyTrend.map((item) => ({ name: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`, value: item.total })),
    recentPayments,
  };
};

router.get('/', authenticate, canManageFinance(), (req, res) => {
  const institutionId = req.user.institutionId;
  Promise.all([populateFee().where({ institutionId }).sort({ createdAt: -1 }), populatePayment().where({ institutionId }).sort({ paymentDate: -1 }), Salary.find({ institutionId }).sort({ createdAt: -1 }), buildSummary(institutionId)])
    .then(([fees, collections, salaryPayments, summary]) => {
      res.json({ fees, collections, salaryPayments, summary });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load finance data', error }));
});

router.get('/payments', authenticate, canManageFinance(), (req, res) => {
  populatePayment()
    .where({ institutionId: req.user.institutionId })
    .sort({ paymentDate: -1 })
    .then((payments) => res.json({ payments }))
    .catch((error) => res.status(500).json({ message: 'Failed to load payments', error }));
});

router.get('/fees', authenticate, canManageFinance(), (req, res) => {
  populateFee()
    .where({ institutionId: req.user.institutionId })
    .sort({ createdAt: -1 })
    .then((fees) => res.json({ fees }))
    .catch((error) => res.status(500).json({ message: 'Failed to load fees', error }));
});

router.post('/fees', authenticate, canManageFinance(), async (req, res) => {
  try {
    const payload = normalizeFeePayload(req.body);
    const calculated = calculateFeeAmount(payload);
    const fee = await Fee.create({
      ...payload,
      ...calculated,
      collectedBy: req.user._id,
      institutionId: req.user.institutionId,
    });
    const created = await populateFee().where({ _id: fee._id, institutionId: req.user.institutionId }).findOne();
    await writeAuditLog(req, 'create', 'fee', fee._id, created);
    res.status(201).json({ fee: created });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : 500).json({ message: error?.message || 'Failed to create fee', error });
  }
});

router.get('/fees/:id', authenticate, canManageFinance(), (req, res) => {
  populateFee()
    .where({ _id: req.params.id, institutionId: req.user.institutionId })
    .findOne()
    .then((fee) => {
      if (!fee) return res.status(404).json({ message: 'Fee not found' });
      res.json({ fee });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load fee', error }));
});

router.put('/fees/:id', authenticate, canManageFinance(), async (req, res) => {
  try {
    const payload = normalizeFeePayload(req.body);
    const calculated = calculateFeeAmount(payload);
    const fee = await Fee.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { ...payload, ...calculated },
      { new: true }
    );
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    const updated = await populateFee().where({ _id: fee._id, institutionId: req.user.institutionId }).findOne();
    await writeAuditLog(req, 'update', 'fee', fee._id, updated);
    res.json({ fee: updated });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : 500).json({ message: error?.message || 'Failed to update fee', error });
  }
});

router.delete('/fees/:id', authenticate, canManageFinance(), async (req, res) => {
  try {
    const fee = await Fee.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!fee) return res.status(404).json({ message: 'Fee not found' });
    await fee.deleteOne();
    await writeAuditLog(req, 'delete', 'fee', fee._id, undefined, fee);
    res.json({ message: 'Fee deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete fee', error });
  }
});

router.get('/collections', authenticate, canManageFinance(), (req, res) => {
  const term = String(req.query.search || '').trim();
  const studentQuery: any = { institutionId: req.user.institutionId };
  if (term) studentQuery.$or = [{ rollNumber: new RegExp(term, 'i') }, { guardianName: new RegExp(term, 'i') }];
  Promise.all([
    populatePayment().where({ institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).limit(20).lean(),
    Student.find(studentQuery).populate('userId', 'name avatar email').populate('classId', 'name grade').populate('sectionId', 'name').limit(10).lean(),
    term ? IDCard.findOne({ institutionId: req.user.institutionId, cardNumber: term }).lean() : Promise.resolve(null),
  ])
    .then(async ([collections, students, card]) => {
      let matches: any[] = students;
      if (card) {
        const cardStudent = await Student.findOne({ _id: card.ownerId, institutionId: req.user.institutionId }).populate('userId', 'name avatar email').populate('classId', 'name grade').populate('sectionId', 'name').lean();
        if (cardStudent) matches = [cardStudent, ...matches.filter((item: any) => String(item._id) !== String(cardStudent._id))];
      }
      const dueByStudent = await Fee.aggregate([
        { $match: { institutionId: req.user.institutionId, status: { $in: ['pending', 'overdue'] } } },
        { $group: { _id: '$studentId', dueAmount: { $sum: '$amount' } } },
      ]);
      const dueMap = new Map(dueByStudent.map((item: any) => [String(item._id), item.dueAmount]));
      res.json({ collections, students: matches.map((item: any) => ({ ...item, dueAmount: dueMap.get(String(item._id)) || 0 })) });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load collections', error }));
});

router.post('/payments', authenticate, canManageFinance(), async (req, res) => {
  try {
    const result = await collectFeePayment(req, 'payment');
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: 'Failed to collect payment', error });
  }
});

router.post('/collections', authenticate, canManageFinance(), async (req, res) => {
  try {
    const result = await collectFeePayment(req, 'collection');
    res.status(result.status).json(result.body);
  } catch (error) {
    res.status(500).json({ message: 'Failed to collect payment', error });
  }
});

router.get('/salary', authenticate, canManageFinance(), (req, res) => {
  Promise.all([
    Salary.find({ institutionId: req.user.institutionId }).sort({ createdAt: -1 }).lean(),
    Teacher.find({ institutionId: req.user.institutionId }).populate('userId', 'name email').lean(),
    Staff.find({ institutionId: req.user.institutionId }).populate('userId', 'name email').lean(),
  ])
    .then(([salaries, teachers, staff]) => res.json({ salaries, employees: [...teachers.map((item: any) => ({ ...item, employeeType: 'teacher' })), ...staff.map((item: any) => ({ ...item, employeeType: 'staff' }))] }))
    .catch((error) => res.status(500).json({ message: 'Failed to load salaries', error }));
});

router.post('/salary/process', authenticate, canManageFinance(), async (req, res) => {
  try {
    const grossSalary = Number(req.body.basicSalary) + Number(req.body.bonus || 0);
    const netSalary = grossSalary - Number(req.body.deduction || 0);
    const salary = await Salary.findOneAndUpdate(
      { institutionId: req.user.institutionId, employeeId: req.body.employeeId, employeeType: req.body.employeeType, month: req.body.month, year: Number(req.body.year) },
      {
        employeeId: req.body.employeeId,
        employeeType: req.body.employeeType,
        basicSalary: Number(req.body.basicSalary),
        allowances: { other: Number(req.body.bonus || 0) },
        deductions: { other: Number(req.body.deduction || 0) },
        grossSalary,
        netSalary,
        month: req.body.month,
        year: Number(req.body.year),
        paymentDate: new Date(),
        status: 'paid',
        paymentMethod: 'bank_transfer',
        processedBy: req.user._id,
        institutionId: req.user.institutionId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeAuditLog(req, 'process', 'salary', salary._id, salary);
    res.status(201).json({ salary });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process salary', error });
  }
});

router.post('/salary', authenticate, canManageFinance(), async (req, res) => {
  try {
    const grossSalary = Number(req.body.basicSalary) + Number(req.body.bonus || req.body.allowances?.other || 0);
    const netSalary = grossSalary - Number(req.body.deduction || req.body.deductions?.other || 0);
    const salary = await Salary.create({
      employeeId: req.body.employeeId,
      employeeType: req.body.employeeType,
      basicSalary: Number(req.body.basicSalary),
      allowances: req.body.allowances || { other: Number(req.body.bonus || 0) },
      deductions: req.body.deductions || { other: Number(req.body.deduction || 0) },
      grossSalary,
      netSalary,
      month: req.body.month,
      year: Number(req.body.year),
      paymentDate: req.body.paymentDate || new Date(),
      status: req.body.status || 'paid',
      paymentMethod: req.body.paymentMethod || 'bank_transfer',
      transactionId: req.body.transactionId,
      notes: req.body.notes,
      processedBy: req.user._id,
      institutionId: req.user.institutionId,
    });
    await writeAuditLog(req, 'create', 'salary', salary._id, salary);
    res.status(201).json({ salary });
  } catch (error) {
    res.status(500).json({ message: 'Failed to add salary', error });
  }
});

router.get('/my-fees', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = now.toLocaleString('en-US', { month: 'long' });
    const currentYear = now.getFullYear();
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      const fees = student ? await Fee.find({ studentId: student._id, institutionId: req.user.institutionId }).sort({ dueDate: -1 }) : [];
      return res.json({ fees, children: [] as any[] });
    }
    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
    if (!parent) return res.json({ fees: [] as any[], children: [] as any[] });
    const childrenRaw = await Promise.all(parent.children.map(async (childId) => {
      const student = await Student.findById(childId).populate('userId', 'name avatar');
      if (!student) return null;
      const fees = await Fee.find({
        studentId: student._id,
        institutionId: req.user.institutionId,
        year: currentYear,
        $or: [{ month: currentMonth }, { month: 'All Months' }],
      });
      return { student, fees };
    }));
    res.json({ fees: [] as any[], children: childrenRaw.filter(Boolean) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load fee data', error });
  }
});

router.get('/reports', authenticate, canManageFinance(), async (req, res) => {
  try {
    const data = await buildSummary(req.user.institutionId);
    res.json(data);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load finance reports', error });
  }
});

export default router;