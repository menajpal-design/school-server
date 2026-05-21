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
const canAdd = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'admin', 'super_admin'].includes(role);
const canManualRoll = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'admin', 'super_admin'].includes(role);
const active = (items: any[] = [], field: string) => String((items.find((x: any) => x?.isActive) || items[items.length - 1])?.[field] || '').trim();
const validBloodGroups = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));
const diagnosticError = (step: string, message: string, statusCode = 500, extra: any = {}) => { const error: any = new Error(message); error.step = step; error.statusCode = statusCode; error.extra = extra; return error; };
const errPayload = (e: any) => ({ message: e?.name === 'ValidationError' ? Object.values(e.errors || {}).map((x: any) => x?.message).join(', ') : e?.code === 11000 ? 'Duplicate record found. If roll was provided, it may already exist.' : e?.message || 'Student API failed', step: e?.step || 'unknown', error: { name: e?.name, message: e?.message, code: e?.code, keyValue: e?.keyValue, ...e?.extra } });
const normalizeRoll = (value: any) => { const raw = String(value || '').trim(); if (!raw) return ''; const digits = raw.replace(/[^0-9]/g, ''); return digits ? String(Number(digits)).padStart(2, '0') : raw; };
const safeDate = (value: any, fallback: Date) => { const date = value ? new Date(value) : fallback; return Number.isNaN(date.getTime()) ? fallback : date; };

async function resolveSchoolContext(req: any) {
  const current = getTenantStorageContext();
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const mongoUri = String(req.user?.institution?.settings?.mongodbUri || active(setting.mongodbUris, 'uri') || setting.mongodbUrl || current?.mongoUri || '').trim();
  const imgbbApiKey = String(req.user?.institution?.settings?.imgbbApiKey || active(setting.imgbbKeys, 'apiKey') || setting.imgbbApiKey || current?.imgbbApiKey || '').trim();
  if (!mongoUri) throw diagnosticError('storage_config', 'School MongoDB URI missing. Settings-এ personal MongoDB URI save করুন, তারপর student add করুন।', 428, { required: 'mongodbUri' });
  return { institutionId: String(req.user.institutionId), mongoUri, imgbbApiKey: imgbbApiKey || undefined };
}
async function schoolDb<T>(req: any, fn: () => Promise<T>) { return runWithTenantStorage(await resolveSchoolContext(req), fn, req.user, req.user?.institution); }

async function ensureClass(req: any) {
  const requestedClassId = String(req.body.classId || '').trim();
  const requestedSectionId = String(req.body.sectionId || '').trim();
  const className = String(req.body.className || req.body.class || '').trim();
  const sectionName = String(req.body.sectionName || req.body.section || '').trim();
  if (!requestedClassId && !className) throw diagnosticError('class_input', 'Class missing. Student form থেকে class select করুন।', 400);
  if (!requestedSectionId && !sectionName) throw diagnosticError('section_input', 'Section missing. Student form থেকে section select করুন।', 400);

  let cls: any = null;
  try {
    if (isObjectId(requestedClassId)) cls = await ClassModel.findOne({ _id: requestedClassId, institutionId: req.user.institutionId });
    if (!cls && className) cls = await ClassModel.findOneAndUpdate({ institutionId: req.user.institutionId, name: className }, { $setOnInsert: { institutionId: req.user.institutionId, name: className, grade: className.match(/\d+/)?.[0] || className, academicYear: String(new Date().getFullYear()), shift: 'day' } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  } catch (e: any) { throw diagnosticError('class_save', `Class database save failed: ${e?.message || 'unknown error'}`, 500, { classId: requestedClassId, className }); }
  if (!cls?._id) throw diagnosticError('class_save', 'Class save/read failed. Personal MongoDB-তে Class collection create হচ্ছে না।', 500, { classId: requestedClassId, className });

  let sec: any = null;
  try {
    if (isObjectId(requestedSectionId)) sec = await Section.findOne({ _id: requestedSectionId, institutionId: req.user.institutionId, classId: cls._id });
    if (!sec) sec = await Section.findOneAndUpdate({ institutionId: req.user.institutionId, classId: cls._id, name: sectionName || 'A' }, { $setOnInsert: { institutionId: req.user.institutionId, classId: cls._id, name: sectionName || 'A', capacity: 30, currentStudents: 0 } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await ClassModel.updateOne({ _id: cls._id }, { $addToSet: { sections: sec._id } });
  } catch (e: any) { throw diagnosticError('section_save', `Section database save failed: ${e?.message || 'unknown error'}`, 500, { sectionId: requestedSectionId, sectionName, classId: String(cls._id) }); }
  if (!sec?._id) throw diagnosticError('section_save', 'Section save/read failed. Personal MongoDB-তে Section collection create হচ্ছে না।', 500, { sectionId: requestedSectionId, sectionName });
  return { classId: cls._id, sectionId: sec._id, className: cls.name, sectionName: sec.name };
}
async function nextAvailableRoll(req: any, classId: any, sectionId: any) { const all = await Student.find({ institutionId: req.user.institutionId, classId, sectionId }).select('rollNumber').lean(); const used = new Set(all.map((x: any) => Number(String(x.rollNumber || '').replace(/[^0-9]/g, ''))).filter((n: number) => Number.isFinite(n) && n > 0)); let next = 1; while (used.has(next)) next += 1; return String(next).padStart(2, '0'); }
async function resolveRoll(req: any, classId: any, sectionId: any) { const requested = normalizeRoll(req.body.rollNumber); if (requested) { if (!canManualRoll(req.user.role)) return nextAvailableRoll(req, classId, sectionId); const exists = await Student.findOne({ institutionId: req.user.institutionId, classId, sectionId, rollNumber: requested }).lean(); if (!exists) return requested; } return nextAvailableRoll(req, classId, sectionId); }
async function createPrimaryUser(input: any, name: string, prefix: string) { const secret = generatePassword(); for (let attempt = 0; attempt < 8; attempt += 1) { const username = await generateUsername(name, prefix); try { const user = await User.create({ ...input, username, email: `${username}@${prefix}.internal.local`, password: await hashPassword(secret) }); return { user, username, secret }; } catch (e: any) { const key = Object.keys(e?.keyPattern || e?.keyValue || {})[0] || ''; if (e?.code === 11000 && (key.includes('username') || key.includes('email'))) continue; throw e; } } throw diagnosticError('primary_user', 'Could not generate a unique username. Please try again.', 409); }
async function enrichStudents(rows: any[]) { const plain = rows.map((item: any) => typeof item?.toObject === 'function' ? item.toObject() : item).filter(Boolean); const userIds = [...new Set(plain.map((item: any) => String(item.userId?._id || item.userId || '')).filter(Boolean))]; const parentIds = [...new Set(plain.map((item: any) => String(item.parentId?._id || item.parentId || '')).filter(Boolean))]; const [users, parents] = await primaryDb(async () => Promise.all([User.find({ _id: { $in: userIds } }).select('name username phone avatar role').lean(), User.find({ _id: { $in: parentIds } }).select('name username phone avatar role').lean()])); const userMap = new Map(users.map((u: any) => [String(u._id), u])); const parentMap = new Map(parents.map((u: any) => [String(u._id), u])); return plain.map((s: any) => ({ ...s, userId: typeof s.userId === 'object' && s.userId?.name ? s.userId : (userMap.get(String(s.userId?._id || s.userId || '')) || s.userId), parentId: typeof s.parentId === 'object' && s.parentId?.name ? s.parentId : (parentMap.get(String(s.parentId?._id || s.parentId || '')) || s.parentId) })); }

router.get('/', authenticate, async (req: any, res) => {
  try {
    const primaryStudentUsers = await primaryDb(() => User.find({ institutionId: req.user.institutionId, role: 'student' }).select('_id').lean());
    const userIds = primaryStudentUsers.map((u: any) => u._id);
    const tenantRows = await schoolDb(req, () => Student.find({ $or: [{ institutionId: req.user.institutionId }, { userId: { $in: userIds } }] }).populate('classId', 'name grade').populate('sectionId', 'name').sort({ createdAt: -1 }).lean());
    const students = await enrichStudents(tenantRows);
    res.json({ students, debug: { tenantCount: tenantRows.length, userCount: userIds.length, sourcePriority: 'tenant-only' } });
  } catch (e: any) { res.status(e?.statusCode || 500).json(errPayload(e)); }
});

router.post('/', authenticate, async (req: any, res) => {
  const rollbackUserIds: any[] = [];
  let step = 'start';
  try {
    if (!canAdd(req.user.role)) return res.status(403).json({ message: 'Only school leadership/teachers can add students.', step: 'permission' });
    step = 'validate_input';
    const guardianName = String(req.body.guardianName || 'Guardian').trim() || 'Guardian';
    const guardianPhone = String(req.body.guardianPhone || req.body.phone || 'N/A').trim() || 'N/A';
    const studentName = String(req.body.name || '').trim();
    if (!studentName) throw diagnosticError('validate_input', 'Student name missing.', 400);
    const address = String(req.body.address || 'Not provided').trim() || 'Not provided';
    const bloodGroup = validBloodGroups.has(String(req.body.bloodGroup || '')) ? req.body.bloodGroup : undefined;

    step = 'primary_user_create';
    const { user, parentUser, uname, secret, pUname, pSecret } = await primaryDb(async () => {
      const studentCreated = await createPrimaryUser({ name: studentName, role: 'student', phone: req.body.phone, avatar: req.body.photo, institutionId: req.user.institutionId }, studentName, 'student');
      rollbackUserIds.push(studentCreated.user._id);
      if (req.body.autoParentAccount === false) return { user: studentCreated.user, parentUser: null, uname: studentCreated.username, secret: studentCreated.secret, pUname: undefined, pSecret: undefined };
      const parentCreated = await createPrimaryUser({ name: guardianName, role: 'parent', phone: guardianPhone, institutionId: req.user.institutionId }, guardianName, 'parent');
      rollbackUserIds.push(parentCreated.user._id);
      return { user: studentCreated.user, parentUser: parentCreated.user, uname: studentCreated.username, secret: studentCreated.secret, pUname: parentCreated.username, pSecret: parentCreated.secret };
    });

    step = 'school_storage_create_profile';
    const student = await schoolDb(req, async () => {
      const resolved = await ensureClass(req);
      const rollNumber = await resolveRoll(req, resolved.classId, resolved.sectionId);
      let created: any;
      try {
        created = await Student.create({ userId: user._id, rollNumber, classId: resolved.classId, sectionId: resolved.sectionId, admissionDate: safeDate(req.body.admissionDate, new Date()), dateOfBirth: safeDate(req.body.dateOfBirth, new Date('2000-01-01')), bloodGroup, address, parentId: parentUser?._id, guardianName, guardianPhone, subjects: [], institutionId: req.user.institutionId });
      } catch (e: any) { throw diagnosticError('student_profile_save', `Student profile save failed in personal MongoDB: ${e?.message || 'unknown error'}`, e?.name === 'ValidationError' ? 400 : 500, { classId: String(resolved.classId), sectionId: String(resolved.sectionId), rollNumber }); }
      await Section.findByIdAndUpdate(resolved.sectionId, { $inc: { currentStudents: 1 } }).catch(() => undefined);
      if (parentUser) await Parent.findOneAndUpdate({ userId: parentUser._id, institutionId: req.user.institutionId }, { userId: parentUser._id, $addToSet: { children: created._id }, address, emergencyContact: guardianName || parentUser.name, emergencyPhone: guardianPhone || parentUser.phone || 'N/A', institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true }).catch((e: any) => { throw diagnosticError('parent_profile_save', `Parent profile save failed in personal MongoDB: ${e?.message || 'unknown error'}`, 500); });
      const saved = await Student.findById(created._id).populate('classId', 'name grade').populate('sectionId', 'name').lean();
      if (!saved?.classId || !saved?.sectionId) throw diagnosticError('student_verify', 'Student saved but class/section was not linked. Check classId/sectionId and personal MongoDB.', 500, { studentId: String(created._id), classId: String(resolved.classId), sectionId: String(resolved.sectionId) });
      return saved;
    });

    const [enrichedStudent] = await enrichStudents([student]);
    res.status(201).json({ message: 'Student admitted successfully with class and section saved in personal MongoDB.', step: 'completed', student: enrichedStudent, user: { _id: user._id, name: user.name, username: user.username, role: user.role }, parent: parentUser ? { _id: parentUser._id, name: parentUser.name, username: parentUser.username, role: parentUser.role } : null, credentials: { username: uname, temporary: secret, parentUsername: pUname, parentTemporary: pSecret } });
  } catch (e: any) {
    if (rollbackUserIds.length && step !== 'completed') await primaryDb(() => User.deleteMany({ _id: { $in: rollbackUserIds } })).catch(() => undefined);
    const payload = errPayload(e); payload.step = e?.step || step; payload.message = `${payload.message} [step: ${payload.step}]`;
    res.status(e?.statusCode || (e?.name === 'ValidationError' ? 400 : 500)).json(payload);
  }
});

export default router;
