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
import SmsTopup from '../models/SmsTopup';

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

router.get('/dashboard', authenticate, canManageFinance(), async (req, res) => {
  try {
    const summary = await buildSummary(req.user.institutionId);
    res.json({ summary });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load finance dashboard', error });
  }
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

router.get('/my-fees', authenticate, async (req: any, res) => {
  try {
    if (req.user.role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      if (!student) {
        return res.json({ fees: [], payments: [], children: [] });
      }
      const fees = await Fee.find({ studentId: student._id, institutionId: req.user.institutionId }).sort({ dueDate: -1 }).lean();
      const payments = await Payment.find({ studentId: student._id, institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).lean();
      return res.json({ fees, payments, children: [] });
    }

    if (req.user.role === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
      if (!parent || !Array.isArray(parent.children) || parent.children.length === 0) {
        return res.json({ fees: [], payments: [], children: [] });
      }
      
      const children = await Student.find({ _id: { $in: parent.children }, institutionId: req.user.institutionId })
        .populate('userId', 'name avatar')
        .lean();
      
      const childIds = children.map(c => c._id);
      const fees = await Fee.find({ studentId: { $in: childIds }, institutionId: req.user.institutionId }).sort({ dueDate: -1 }).lean();
      const payments = await Payment.find({ studentId: { $in: childIds }, institutionId: req.user.institutionId }).sort({ paymentDate: -1 }).lean();
      
      return res.json({ fees, payments, children });
    }

    return res.status(400).json({ message: 'Only students and parents can view fee details.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to load fee data', error: error?.message || String(error) });
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

// Audit and export endpoints
router.get('/audit', authenticate, canManageFinance(), async (req, res) => {
  try {
    const start = req.query.start ? new Date(String(req.query.start)) : new Date('1970-01-01');
    const end = req.query.end ? new Date(String(req.query.end)) : new Date();
    // normalize end to include the day
    end.setHours(23, 59, 59, 999);

    const payments = await Payment.find({ institutionId: req.user.institutionId, paymentDate: { $gte: start, $lte: end } }).lean();
    const salaries = await Salary.find({ institutionId: req.user.institutionId, paymentDate: { $gte: start, $lte: end } }).lean();
    const smsTopups = await SmsTopup.find({ institutionId: req.user.institutionId, createdAt: { $gte: start, $lte: end } }).lean();
    const fees = await Fee.find({ institutionId: req.user.institutionId, createdAt: { $gte: start, $lte: end } }).lean();

    const totalIncome = payments.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalSalaries = salaries.reduce((s: number, p: any) => s + (p.netSalary || p.net || 0), 0);
    const totalSms = smsTopups.reduce((s: number, p: any) => s + (p.amount || 0), 0);
    const totalFees = fees.reduce((s: number, f: any) => s + (f.amount || 0), 0);

    res.json({ totals: { totalIncome, totalFees, totalSalaries, totalSms }, counts: { payments: payments.length, salaries: salaries.length, smsTopups: smsTopups.length, fees: fees.length }, items: { payments, salaries, smsTopups, fees } });
  } catch (error) {
    res.status(500).json({ message: 'Audit failed', error });
  }
});

router.get('/audit/export', authenticate, canManageFinance(), async (req, res) => {
  try {
    const fmt = String(req.query.format || 'csv');
    const start = req.query.start ? new Date(String(req.query.start)) : new Date('1970-01-01');
    const end = req.query.end ? new Date(String(req.query.end)) : new Date();
    end.setHours(23, 59, 59, 999);

    const payments = await Payment.find({ institutionId: req.user.institutionId, paymentDate: { $gte: start, $lte: end } }).lean();
    const salaries = await Salary.find({ institutionId: req.user.institutionId, paymentDate: { $gte: start, $lte: end } }).lean();
    const smsTopups = await SmsTopup.find({ institutionId: req.user.institutionId, createdAt: { $gte: start, $lte: end } }).lean();

    if (fmt === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="finance-audit-${Date.now()}.csv"`);
      const rows: string[] = [];
      rows.push('type,date,reference,description,amount');
      payments.forEach((p: any) => rows.push([ 'payment', new Date(p.paymentDate).toISOString(), p.receiptNumber || '', p.notes?.replace(/[,\n\r]+/g, ' ') || '', String(p.amount || 0) ].join(',')));
      salaries.forEach((s: any) => rows.push([ 'salary', new Date(s.paymentDate).toISOString(), s._id, s.notes?.replace(/[,\n\r]+/g, ' ') || '', String(s.netSalary || s.net || 0) ].join(',')));
      smsTopups.forEach((t: any) => rows.push([ 'sms_topup', new Date(t.createdAt).toISOString(), t._id, JSON.stringify(t.meta || {}).replace(/[,\n\r]+/g, ' '), String(t.amount || 0) ].join(',')));
      return res.send(rows.join('\n'));
    }

    if (fmt === 'pdf') {
      const PDFDocument = require('pdfkit');
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="finance-audit-${Date.now()}.pdf"`);
      doc.fontSize(16).text('Finance Audit Report', { align: 'center' });
      doc.moveDown();
      doc.fontSize(10).text(`Institution: ${(req as any).institution?.name || ''}`);
      doc.text(`Range: ${start.toISOString().slice(0,10)} - ${end.toISOString().slice(0,10)}`);
      doc.moveDown();
      doc.fontSize(12).text('Payments', { underline: true });
      payments.forEach((p: any) => {
        doc.fontSize(9).text(`${new Date(p.paymentDate).toLocaleString()} · ${p.receiptNumber || ''} · ${p.amount}`);
      });
      doc.addPage();
      doc.fontSize(12).text('Salaries', { underline: true });
      salaries.forEach((s: any) => {
        doc.fontSize(9).text(`${new Date(s.paymentDate).toLocaleString()} · ${s.employeeId || s._id} · ${s.netSalary || s.net || 0}`);
      });
      doc.end();
      doc.pipe(res);
      return;
    }

    res.status(400).json({ message: 'Unsupported format' });
  } catch (error) {
    res.status(500).json({ message: 'Export failed', error });
  }
});