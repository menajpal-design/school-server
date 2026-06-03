import express from 'express';
import { authenticate } from '../middleware/auth';
import Student from '../models/Student';
import User from '../models/User';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import IDCard from '../models/IDCard';
import Parent from '../models/Parent';
import Fee from '../models/Fee';
import Teacher from '../models/Teacher';
import SiteSetting from '../models/SiteSetting';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = async <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const canManageStudents = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher'].includes(role);

const readable = (error: any) => {
  if (error?.name === 'ValidationError') return Object.values(error.errors || {}).map((item: any) => item?.message).filter(Boolean).join(', ') || error.message;
  if (error?.code === 11000) return 'Duplicate student/user information found. Please check email, username or roll number.';
  return error?.message || 'Student API failed.';
};

const activeFrom = (items: any[] = [], field: string) => {
  const active = items.find((item: any) => item?.isActive) || items[items.length - 1];
  return String(active?.[field] || '').trim();
};

async function schoolDb<T>(req: any, fn: () => Promise<T>) {
  let context = getTenantStorageContext();
  if (!context?.mongoUri) {
    const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
    const mongoUri = String(req.user?.institution?.settings?.mongodbUri || activeFrom(setting.mongodbUris, 'uri') || setting.mongodbUrl || '').trim();
    if (!mongoUri) {
      const error: any = new Error('School MongoDB URI missing. Save MongoDB URI in Settings before adding students.');
      error.statusCode = 428;
      throw error;
    }
    context = { institutionId: String(req.user.institutionId), mongoUri };
  }
  return runWithTenantStorage(context, fn, req.user, req.user?.institution);
}

const studentQueryForUser = async (req: any) => {
  const query: any = { institutionId: req.user.institutionId };
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
    const teacher = await Teacher.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).lean();
    query.classId = { $in: teacher?.assignedClasses || [] };
  }
  return query;
};

const ensureClassAndSection = async (req: any) => {
  const academicYear = String(req.body.academicYear || new Date().getFullYear());
  const className = String(req.body.className || req.body.class || 'New Class').trim();
  const sectionName = String(req.body.sectionName || req.body.section || 'A').trim();
  const classItem = await ClassModel.findOneAndUpdate(
    { name: className, institutionId: req.user.institutionId },
    { $setOnInsert: { name: className, grade: className.match(/\d+/)?.[0] || className, academicYear, shift: 'day', institutionId: req.user.institutionId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const section = await Section.findOneAndUpdate(
    { name: sectionName, classId: classItem._id, institutionId: req.user.institutionId },
    { $setOnInsert: { name: sectionName, classId: classItem._id, capacity: 30, currentStudents: 0, institutionId: req.user.institutionId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ClassModel.updateOne({ _id: classItem._id, institutionId: req.user.institutionId }, { $addToSet: { sections: section._id } });
  return { classId: classItem._id, sectionId: section._id };
};

const createIdCard = (ownerId: any, req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `STUDENT-${Date.now()}-${String(ownerId).slice(-4)}`;
  return IDCard.create({ ownerId, ownerType: 'student', cardNumber, cardType: 'standard', photoUrl, qrCodeData: cardNumber, barcodeData: cardNumber, validityStart: now, validityEnd, issuedBy: req.user._id, issuedAt: now, institutionId: req.user.institutionId });
};

const calculateFee = (body: any) => {
  const originalAmount = Number(body.feeAmount || body.feeSetup?.amount || 0);
  const waiverType = body.feeWaiverType || body.feeSetup?.waiverType || 'none';
  const explicitWaiver = Number(body.feeWaiverAmount || body.feeSetup?.waiverAmount || 0);
  const waiverAmount = waiverType === 'free' ? originalAmount : waiverType === 'half' ? originalAmount / 2 : waiverType === 'partial' ? explicitWaiver : Number(body.scholarship || body.discount || 0);
  return { originalAmount, waiverType, waiverAmount: Math.min(originalAmount, Math.max(0, waiverAmount)), amount: Math.max(0, originalAmount - Math.min(originalAmount, Math.max(0, waiverAmount))) };
};

router.get('/', authenticate, async (req, res) => {
  try {
    const students = await schoolDb(req, async () => Student.find(await studentQueryForUser(req))
      .populate('userId', 'name email phone avatar')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .populate('parentId', 'name email phone')
      .sort({ createdAt: -1 }));
    res.json({ students });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: readable(error), error: { name: error?.name, message: error?.message } });
  }
});

router.post('/', authenticate, async (req, res) => {
  try {
    if (!canManageStudents(req.user.role)) return res.status(403).json({ message: 'Only teachers or school leadership can add students' });
    if (!String(req.body.guardianPhone || '').trim()) return res.status(400).json({ message: 'Parent/guardian phone is required' });

    const email = String(req.body.email || `${String(req.body.rollNumber || Date.now()).toLowerCase()}@student.local`);
    const parentEmail = req.body.guardianEmail || `parent-${Date.now()}@parent.local`;
    const username = await primaryDb(() => generateUsername(req.body.name, 'student'));
    const temporaryPassword = generatePassword();
    const parentPassword = generatePassword();

    const { user, parentUser } = await primaryDb(async () => {
      const existing = await User.findOne({ email, institutionId: req.user.institutionId });
      if (existing) {
        const error: any = new Error('A user with this email already exists');
        error.statusCode = 409;
        throw error;
      }
      const studentUser = await User.create({ name: req.body.name, username, email, password: await hashPassword(temporaryPassword), role: 'student', phone: req.body.phone, avatar: req.body.photo, gender: req.body.gender, institutionId: req.user.institutionId });
      let guardianUser = await User.findOne({ email: parentEmail, institutionId: req.user.institutionId });
      if (req.body.autoParentAccount !== false && !guardianUser) {
        guardianUser = await User.create({ name: req.body.guardianName, email: parentEmail, username: await generateUsername(req.body.guardianName, 'parent'), password: await hashPassword(parentPassword), role: 'parent', phone: req.body.guardianPhone, gender: req.body.guardianGender || req.body.parentGender, institutionId: req.user.institutionId });
      }
      return { user: studentUser, parentUser: guardianUser };
    });

    const { student, idCard } = await schoolDb(req, async () => {
      const { classId, sectionId } = await ensureClassAndSection(req);
      const createdStudent = await Student.create({ userId: user._id, rollNumber: req.body.rollNumber, classId, sectionId, admissionDate: req.body.admissionDate || new Date(), dateOfBirth: req.body.dateOfBirth || undefined, bloodGroup: req.body.bloodGroup || undefined, address: req.body.address, parentId: parentUser?._id, guardianName: req.body.guardianName, guardianPhone: req.body.guardianPhone, guardianEmail: req.body.guardianEmail, subjects: [], institutionId: req.user.institutionId });
      await Section.findByIdAndUpdate(sectionId, { $inc: { currentStudents: 1 } });
      if (parentUser) {
        await Parent.findOneAndUpdate({ userId: parentUser._id, institutionId: req.user.institutionId }, { userId: parentUser._id, $addToSet: { children: createdStudent._id }, occupation: req.body.parentOccupation, income: Number(req.body.parentIncome) || undefined, address: req.body.address || 'Not provided', emergencyContact: req.body.emergencyContact || req.body.guardianName || parentUser.name, emergencyPhone: req.body.emergencyPhone || req.body.guardianPhone || parentUser.phone || 'N/A', institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
      }
      if (req.body.feeSetup || req.body.feeAmount) {
        const fee = calculateFee(req.body);
        await Fee.create({ studentId: createdStudent._id, classId, amount: fee.amount, originalAmount: fee.originalAmount, waiverType: fee.waiverType, waiverAmount: fee.waiverAmount, waiverReason: req.body.feeWaiverReason || req.body.feeSetup?.waiverReason, type: req.body.feeType || req.body.feeSetup?.type || 'monthly', month: req.body.feeMonth || req.body.feeSetup?.month || new Date().toLocaleString('en-US', { month: 'long' }), year: Number(req.body.feeYear || req.body.feeSetup?.year || new Date().getFullYear()), dueDate: req.body.feeDueDate || req.body.feeSetup?.dueDate || new Date(), collectedBy: req.user._id, institutionId: req.user.institutionId });
      }
      const card = req.body.autoIdCard !== false ? await createIdCard(createdStudent._id, req, req.body.photo) : null;
      return { student: createdStudent, idCard: card };
    });

    await sendSMS({ to: req.body.guardianPhone, message: buildCredentialSmsMessage({ summary: `Admission completed for ${req.body.name}`, username, password: temporaryPassword, parentUsername: parentUser?.username || parentEmail, parentPassword: parentUser ? parentPassword : 'existing password' }), institutionId: req.user.institutionId });
    res.status(201).json({ student, user, parent: parentUser, idCard, credentials: { username, password: temporaryPassword, parentPassword: parentUser ? parentPassword : undefined } });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: readable(error), error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

export default router;
