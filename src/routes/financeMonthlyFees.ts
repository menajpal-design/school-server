import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageFinance, normalizeRole } from '../middleware/auth';
import ClassFeeStructure from '../models/ClassFeeStructure';
import StudentInvoice from '../models/StudentInvoice';
import Student from '../models/Student';
import Parent from '../models/Parent';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();
const feeType = 'monthly_tuition';
const money = (value: any) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
const invoiceNo = (studentId: any, month: number, year: number) => `INV-${year}${String(month).padStart(2, '0')}-${String(studentId).slice(-6)}-${Date.now().toString().slice(-5)}`;
const structureRoles = ['head', 'admin', 'super_admin'];
const canEditStructure = (req: any) => structureRoles.includes(normalizeRole(req.user?.role));

const requireStructureEditor = (req: any, res: any, next: any) => {
  if (!canEditStructure(req)) return res.status(403).json({ message: 'Only Head/Admin can change class monthly fee setup.' });
  next();
};

const findStudentInvoices = () => StudentInvoice.find()
  .populate({ path: 'studentId', populate: { path: 'userId', select: 'name avatar email phone' } })
  .populate('classId', 'name grade')
  .populate('generatedBy', 'name');

const findStructures = () => ClassFeeStructure.find()
  .populate('classId', 'name grade')
  .populate('createdBy updatedBy', 'name');

router.get('/class-fee-structures', authenticate, canManageFinance(), async (req: any, res) => {
  try {
    const structures = await findStructures().where({ institutionId: req.user.institutionId }).sort({ effectiveFromYear: -1, effectiveFromMonth: -1, createdAt: -1 });
    res.json({ structures });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load class monthly fee setup.', error });
  }
});

router.post('/class-fee-structures', authenticate, requireStructureEditor, async (req: any, res) => {
  try {
    const payload = {
      feeType,
      institutionId: req.user.institutionId,
      classId: req.body.classId,
      section: req.body.section || 'All',
      amount: money(req.body.amount),
      dueDay: Number(req.body.dueDay || 10),
      lateFeeAmount: money(req.body.lateFeeAmount || 0),
      effectiveFromMonth: Number(req.body.effectiveFromMonth || new Date().getMonth() + 1),
      effectiveFromYear: Number(req.body.effectiveFromYear || new Date().getFullYear()),
      isActive: req.body.isActive !== false,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    };
    const structure = await ClassFeeStructure.findOneAndUpdate(
      { institutionId: payload.institutionId, feeType, classId: payload.classId, section: payload.section, effectiveFromMonth: payload.effectiveFromMonth, effectiveFromYear: payload.effectiveFromYear },
      payload,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    await writeAuditLog(req, 'upsert', 'class_fee_structure', structure._id, structure);
    res.status(201).json({ message: 'Class monthly fee setup saved.', structure });
  } catch (error: any) {
    res.status(error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : 500).json({ message: error?.message || 'Failed to save class monthly fee setup.', error });
  }
});

router.post('/monthly-fees/generate', authenticate, canManageFinance(), async (req: any, res) => {
  try {
    const month = Number(req.body.month || new Date().getMonth() + 1);
    const year = Number(req.body.year || new Date().getFullYear());
    const classId = req.body.classId;
    const section = req.body.section || 'All';
    if (!classId || !mongoose.isValidObjectId(classId)) return res.status(400).json({ message: 'Valid classId is required.' });

    const structure = await ClassFeeStructure.findOne({
      institutionId: req.user.institutionId,
      feeType,
      classId,
      section: { $in: [section, 'All'] },
      isActive: true,
      $or: [
        { effectiveFromYear: { $lt: year } },
        { effectiveFromYear: year, effectiveFromMonth: { $lte: month } },
      ],
    }).sort({ effectiveFromYear: -1, effectiveFromMonth: -1 });

    if (!structure) return res.status(404).json({ message: 'No active monthly fee setup found for this class/section.' });

    const students = await Student.find({ institutionId: req.user.institutionId, classId, isActive: { $ne: false } }).select('_id classId sectionId rollNumber').lean();
    let generated = 0;
    let skipped = 0;
    const dueDate = new Date(year, month - 1, Math.min(Number(structure.dueDay || 10), 28));

    for (const student of students) {
      const existing = await StudentInvoice.findOne({ institutionId: req.user.institutionId, studentId: student._id, classId, month, year, feeType });
      if (existing) { skipped += 1; continue; }
      await StudentInvoice.create({ institutionId: req.user.institutionId, studentId: student._id, classId, section, month, year, feeType, invoiceNo: invoiceNo(student._id, month, year), items: [{ name: 'Monthly Tuition Fee', amount: money(structure.amount), discount: 0, lateFee: 0 }], totalAmount: money(structure.amount), paidAmount: 0, dueAmount: money(structure.amount), status: 'unpaid', dueDate, generatedBy: req.user._id });
      generated += 1;
    }

    res.status(201).json({ message: 'Monthly fees generated successfully.', generated, skipped, totalStudents: students.length });
  } catch (error: any) {
    res.status(error?.code === 11000 || error?.name === 'ValidationError' || error?.name === 'CastError' ? 400 : 500).json({ message: error?.message || 'Failed to generate monthly fees.', error });
  }
});

router.get('/student-invoices', authenticate, canManageFinance(), async (req: any, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    if (req.query.classId) query.classId = req.query.classId;
    if (req.query.studentId) query.studentId = req.query.studentId;
    if (req.query.month) query.month = Number(req.query.month);
    if (req.query.year) query.year = Number(req.query.year);
    if (req.query.status) query.status = req.query.status;
    const invoices = await findStudentInvoices().where(query).sort({ year: -1, month: -1, createdAt: -1 }).limit(300);
    res.json({ invoices });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load student invoices.', error });
  }
});

router.get('/my-invoices', authenticate, async (req: any, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (role === 'student') {
      const student = await Student.findOne({ userId: req.user._id, institutionId: req.user.institutionId });
      const invoices = student ? await findStudentInvoices().where({ institutionId: req.user.institutionId, studentId: student._id }).sort({ year: -1, month: -1 }) : [];
      return res.json({ invoices, children: [] });
    }
    const parent = await Parent.findOne({ userId: req.user._id, institutionId: req.user.institutionId }).lean();
    if (!parent) return res.json({ invoices: [], children: [] });
    const children = await Student.find({ _id: { $in: parent.children || [] }, institutionId: req.user.institutionId }).populate('userId', 'name avatar').lean();
    const childrenData = await Promise.all(children.map(async (student: any) => {
      const invoices = await findStudentInvoices().where({ institutionId: req.user.institutionId, studentId: student._id }).sort({ year: -1, month: -1 });
      return { student, invoices };
    }));
    res.json({ invoices: [], children: childrenData });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load student fee invoices.', error });
  }
});

export default router;
