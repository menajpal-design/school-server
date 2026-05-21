import express from 'express';
import mongoose from 'mongoose';
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
const canAdd = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher'].includes(role);
const canManualRoll = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher'].includes(role);
const active = (items: any[] = [], field: string) => String((items.find((x: any) => x?.isActive) || items[items.length - 1])?.[field] || '').trim();
const errMsg = (e: any) => e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.code === 11000 ? 'Duplicate record found. If roll was provided, it may already exist.' : e?.message || 'Student API failed';
const validBloodGroups = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));

const normalizeRoll = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return raw;
  return String(Number(digits)).padStart(2, '0');
};
const safeDate = (value: any, fallback: Date) => {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
};

async function resolveSchoolContext(req: any) {
  const current = getTenantStorageContext();
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const mongoUri = String(req.user?.institution?.settings?.mongodbUri || active(setting.mongodbUris, 'uri') || setting.mongodbUrl || current?.mongoUri || '').trim();
  const imgbbApiKey = String(req.user?.institution?.settings?.imgbbApiKey || active(setting.imgbbKeys, 'apiKey') || setting.imgbbApiKey || current?.imgbbApiKey || '').trim();
  if (!mongoUri) { const e: any = new Error('School MongoDB URI missing. Save MongoDB URI in Settings before adding students.'); e.statusCode = 428; throw e; }
  return { institutionId: String(req.user.institutionId), mongoUri, imgbbApiKey: imgbbApiKey || undefined };
}
async function schoolDb<T>(req: any, fn: () => Promise<T>) { return runWithTenantStorage(await resolveSchoolContext(req), fn, req.user, req.user?.institution); }

async function ensureClass(req: any) {
  const requestedClassId = String(req.body.classId || '').trim();
  const requestedSectionId = String(req.body.sectionId || '').trim();
  const className = String(req.body.className || req.body.class || 'Class 1').trim();
  const sectionName = String(req.body.sectionName || req.body.section || 'A').trim();

  let cls: any = null;
  if (isObjectId(requestedClassId)) {
    cls = await ClassModel.findOne({ _id: requestedClassId, institutionId: req.user.institutionId });
  }
  if (!cls) {
    cls = await ClassModel.findOneAndUpdate(
      { institutionId: req.user.institutionId, name: className },
      { $setOnInsert: { institutionId: req.user.institutionId, name: className, grade: className.match(/\d+/)?.[0] || className, academicYear: String(new Date().getFullYear()), shift: 'day' } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  let sec: any = null;
  if (isObjectId(requestedSectionId)) {
    sec = await Section.findOne({ _id: requestedSectionId, institutionId: req.user.institutionId, classId: cls._id });
  }
  if (!sec) {
    sec = await Section.findOneAndUpdate(
      { institutionId: req.user.institutionId, classId: cls._id, name: sectionName },
      { $setOnInsert: { institutionId: req.user.institutionId, classId: cls._id, name: sectionName, capacity: 30, currentStudents: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }
  await ClassModel.updateOne({ _id: cls._id }, { $addToSet: { sections: sec._id } });
  return { classId: cls._id, sectionId: sec._id };
}
async function nextAvailableRoll(req: any, classId: any, sectionId: any) {
  const all = await Student.find({ institutionId: req.user.institutionId, classId, sectionId }).select('rollNumber').lean();
  const used = new Set(all.map((x: any) => Number(String(x.rollNumber || '').replace(/[^0-9]/g, ''))).filter((n: number) => Number.isFinite(n) && n > 0));
  let next = 1; while (used.has(next)) next += 1; return String(next).padStart(2, '0');
}
async function resolveRoll(req: any, classId: any, sectionId: any) {
  const requested = normalizeRoll(req.body.rollNumber);
  if (requested) { if (!canManualRoll(req.user.role)) return nextAvailableRoll(req, classId, sectionId); const exists = await Student.findOne({ institutionId: req.user.institutionId, classId, sectionId, rollNumber: requested }).lean(); if (!exists) return requested; }
  return nextAvailableRoll(req, classId, sectionId);
}
async function createPrimaryUser(input: any, name: string, prefix: string) {
  const secret = generatePassword();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const username = await generateUsername(name, prefix);
    try { const user = await User.create({ ...input, username, email: `${username}@${prefix}.internal.local`, password: await hashPassword(secret) }); return { user, username, secret }; }
    catch (e: any) { const key = Object.keys(e?.keyPattern || e?.keyValue || {})[0] || ''; if (e?.code === 11000 && (key.includes('username') || key.includes('email'))) continue; throw e; }
  }
  const e: any = new Error('Could not generate a unique username. Please try again.'); e.statusCode = 409; throw e;
}
async function enrichStudents(rows: any[]) {
  const plain = rows.map((item: any) => typeof item.toObject === 'function' ? item.toObject() : item);
  const userIds = [...new Set(plain.map((item: any) => String(item.userId?._id || item.userId || '')).filter(Boolean))];
  const parentIds = [...new Set(plain.map((item: any) => String(item.parentId?._id || item.parentId || '')).filter(Boolean))];
  const [users, parents] = await primaryDb(async () => Promise.all([User.find({ _id: { $in: userIds } }).select('name username phone avatar role').lean(), User.find({ _id: { $in: parentIds } }).select('name username phone avatar role').lean()]));
  const userMap = new Map(users.map((u: any) => [String(u._id), u]));
  const parentMap = new Map(parents.map((u: any) => [String(u._id), u]));
  return plain.map((s: any) => ({ ...s, userId: typeof s.userId === 'object' && s.userId?.name ? s.userId : (userMap.get(String(s.userId?._id || s.userId || '')) || s.userId), parentId: typeof s.parentId === 'object' && s.parentId?.name ? s.parentId : (parentMap.get(String(s.parentId?._id || s.parentId || '')) || s.parentId) }));
}

router.get('/', authenticate, async (req: any, res) => {
  try {
    const primaryStudentUsers = await primaryDb(() => User.find({ institutionId: req.user.institutionId, role: 'student' }).select('_id').lean());
    const userIds = primaryStudentUsers.map((u: any) => u._id);
    const tenantRows = await schoolDb(req, () => Student.find({ $or: [{ institutionId: req.user.institutionId }, { userId: { $in: userIds } }] }).populate('classId', 'name grade').populate('sectionId', 'name').sort({ createdAt: -1 }).lean());
    const primaryRows = await primaryDb(() => Student.find({ $or: [{ institutionId: req.user.institutionId }, { userId: { $in: userIds } }] }).populate('classId', 'name grade').populate('sectionId', 'name').sort({ createdAt: -1 }).lean()).catch(() => [] as any[]);
    const merged = new Map<string, any>();
    [...primaryRows, ...tenantRows].forEach((item: any) => merged.set(String(item.userId?._id || item.userId || item._id), item));
    const students = await enrichStudents(Array.from(merged.values()));
    res.json({ students, debug: { tenantCount: tenantRows.length, primaryCount: primaryRows.length, userCount: userIds.length, sourcePriority: 'tenant-over-primary' } });
  } catch (e: any) { res.status(e?.statusCode || 500).json({ message: errMsg(e), error: { name: e?.name, message: e?.message } }); }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canAdd(req.user.role)) return res.status(403).json({ message: 'Only school leadership/teachers can add students.' });
    const guardianName = String(req.body.guardianName || 'Guardian').trim() || 'Guardian';
    const guardianPhone = String(req.body.guardianPhone || req.body.phone || 'N/A').trim() || 'N/A';
    const studentName = String(req.body.name || 'Student').trim() || 'Student';
    const address = String(req.body.address || 'Not provided').trim() || 'Not provided';
    const bloodGroup = validBloodGroups.has(String(req.body.bloodGroup || '')) ? req.body.bloodGroup : undefined;
    const { user, parentUser, uname, secret, pUname, pSecret } = await primaryDb(async () => {
      const studentCreated = await createPrimaryUser({ name: studentName, role: 'student', phone: req.body.phone, avatar: req.body.photo, institutionId: req.user.institutionId }, studentName, 'student');
      if (req.body.autoParentAccount === false) return { user: studentCreated.user, parentUser: null, uname: studentCreated.username, secret: studentCreated.secret, pUname: undefined, pSecret: undefined };
      const parentCreated = await createPrimaryUser({ name: guardianName, role: 'parent', phone: guardianPhone, institutionId: req.user.institutionId }, guardianName, 'parent');
      return { user: studentCreated.user, parentUser: parentCreated.user, uname: studentCreated.username, secret: studentCreated.secret, pUname: parentCreated.username, pSecret: parentCreated.secret };
    });
    const student = await schoolDb(req, async () => {
      const { classId, sectionId } = await ensureClass(req); const rollNumber = await resolveRoll(req, classId, sectionId);
      const created = await Student.create({ userId: user._id, rollNumber, classId, sectionId, admissionDate: safeDate(req.body.admissionDate, new Date()), dateOfBirth: safeDate(req.body.dateOfBirth, new Date('2000-01-01')), bloodGroup, address, parentId: parentUser?._id, guardianName, guardianPhone, subjects: [], institutionId: req.user.institutionId });
      await Section.findByIdAndUpdate(sectionId, { $inc: { currentStudents: 1 } });
      if (parentUser) await Parent.findOneAndUpdate({ userId: parentUser._id, institutionId: req.user.institutionId }, { userId: parentUser._id, $addToSet: { children: created._id }, address, emergencyContact: guardianName || parentUser.name, emergencyPhone: guardianPhone || parentUser.phone || 'N/A', institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
      return await Student.findById(created._id).populate('classId', 'name grade').populate('sectionId', 'name').lean();
    });
    const [enrichedStudent] = await enrichStudents([student]);
    res.status(201).json({ student: enrichedStudent, user: { _id: user._id, name: user.name, username: user.username, role: user.role }, parent: parentUser ? { _id: parentUser._id, name: parentUser.name, username: parentUser.username, role: parentUser.role } : null, credentials: { username: uname, temporary: secret, parentUsername: pUname, parentTemporary: pSecret } });
  } catch (e: any) { res.status(e?.statusCode || (e?.name === 'ValidationError' ? 400 : 500)).json({ message: errMsg(e), error: { name: e?.name, message: e?.message, code: e?.code, keyValue: e?.keyValue } }); }
});

export default router;
