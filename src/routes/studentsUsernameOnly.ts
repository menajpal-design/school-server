import express from 'express';
import { authenticate } from '../middleware/auth';
import User from '../models/User';
import Student from '../models/Student';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Parent from '../models/Parent';
import SiteSetting from '../models/SiteSetting';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { getTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const canAdd = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher'].includes(role);
const active = (items: any[] = [], field: string) => String((items.find((x: any) => x?.isActive) || items[items.length - 1])?.[field] || '').trim();
const errMsg = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.code === 11000 ? 'Duplicate username or roll number found.' : e?.message || 'Student API failed';

async function schoolDb<T>(req: any, fn: () => Promise<T>) {
  let ctx = getTenantStorageContext();
  if (!ctx?.mongoUri) {
    const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
    const mongoUri = String(req.user?.institution?.settings?.mongodbUri || active(setting.mongodbUris, 'uri') || setting.mongodbUrl || '').trim();
    if (!mongoUri) {
      const e: any = new Error('School MongoDB URI missing. Save MongoDB URI in Settings before adding students.');
      e.statusCode = 428;
      throw e;
    }
    ctx = { institutionId: String(req.user.institutionId), mongoUri };
  }
  return runWithTenantStorage(ctx, fn, req.user, req.user?.institution);
}

async function ensureClass(req: any) {
  const className = String(req.body.className || req.body.class || 'Class 1').trim();
  const sectionName = String(req.body.sectionName || req.body.section || 'A').trim();
  const cls = await ClassModel.findOneAndUpdate({ institutionId: req.user.institutionId, name: className }, { $setOnInsert: { institutionId: req.user.institutionId, name: className, grade: className.match(/\d+/)?.[0] || className, academicYear: String(new Date().getFullYear()), shift: 'day' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const sec = await Section.findOneAndUpdate({ institutionId: req.user.institutionId, classId: cls._id, name: sectionName }, { $setOnInsert: { institutionId: req.user.institutionId, classId: cls._id, name: sectionName, capacity: 30, currentStudents: 0 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  await ClassModel.updateOne({ _id: cls._id }, { $addToSet: { sections: sec._id } });
  return { classId: cls._id, sectionId: sec._id };
}

router.get('/', authenticate, async (req: any, res) => {
  try {
    const students = await schoolDb(req, () => Student.find({ institutionId: req.user.institutionId }).populate('userId', 'name username phone avatar').populate('classId', 'name grade').populate('sectionId', 'name').sort({ createdAt: -1 }));
    res.json({ students });
  } catch (e: any) {
    res.status(e?.statusCode || 500).json({ message: errMsg(e), error: { name: e?.name, message: e?.message } });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canAdd(req.user.role)) return res.status(403).json({ message: 'Only school leadership/teachers can add students.' });
    if (!String(req.body.guardianPhone || '').trim()) return res.status(400).json({ message: 'Guardian phone is required.' });

    const uname = await primaryDb(() => generateUsername(req.body.name, 'student'));
    const secret = generatePassword();
    const pUname = req.body.autoParentAccount === false ? undefined : await primaryDb(() => generateUsername(req.body.guardianName || 'guardian', 'parent'));
    const pSecret = req.body.autoParentAccount === false ? undefined : generatePassword();

    const { user, parentUser } = await primaryDb(async () => {
      const studentUser = await User.create({ name: req.body.name, username: uname, password: await hashPassword(secret), role: 'student', phone: req.body.phone, avatar: req.body.photo, institutionId: req.user.institutionId });
      const guardianUser = req.body.autoParentAccount === false ? null : await User.create({ name: req.body.guardianName || 'Guardian', username: pUname, password: await hashPassword(pSecret as string), role: 'parent', phone: req.body.guardianPhone, institutionId: req.user.institutionId });
      return { user: studentUser, parentUser: guardianUser };
    });

    const student = await schoolDb(req, async () => {
      const { classId, sectionId } = await ensureClass(req);
      const created = await Student.create({ userId: user._id, rollNumber: req.body.rollNumber, classId, sectionId, admissionDate: req.body.admissionDate || new Date(), dateOfBirth: req.body.dateOfBirth || undefined, bloodGroup: req.body.bloodGroup || undefined, address: req.body.address, parentId: parentUser?._id, guardianName: req.body.guardianName, guardianPhone: req.body.guardianPhone, subjects: [], institutionId: req.user.institutionId });
      await Section.findByIdAndUpdate(sectionId, { $inc: { currentStudents: 1 } });
      if (parentUser) await Parent.findOneAndUpdate({ userId: parentUser._id, institutionId: req.user.institutionId }, { userId: parentUser._id, $addToSet: { children: created._id }, address: req.body.address || 'Not provided', emergencyContact: req.body.guardianName || parentUser.name, emergencyPhone: req.body.guardianPhone || parentUser.phone || 'N/A', institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
      return created;
    });

    res.status(201).json({ student, user: { _id: user._id, name: user.name, username: user.username, role: user.role }, parent: parentUser ? { _id: parentUser._id, name: parentUser.name, username: parentUser.username, role: parentUser.role } : null, credentials: { username: uname, temporary: secret, parentUsername: parentUser?.username, parentTemporary: pSecret } });
  } catch (e: any) {
    res.status(e?.statusCode || (e?.name === 'ValidationError' ? 400 : 500)).json({ message: errMsg(e), error: { name: e?.name, message: e?.message, code: e?.code } });
  }
});

export default router;
