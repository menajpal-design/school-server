import express from 'express';
import mongoose from 'mongoose';
import { authenticate, normalizeRole } from '../middleware/auth';
import Teacher from '../models/Teacher';
import User from '../models/User';
import ClassModel from '../models/Class';
import Subject from '../models/Subject';
import IDCard from '../models/IDCard';
import Institution from '../models/Institution';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';
import { sendEmail } from '../services/emailService';
import { generateAppointmentLetter } from '../utils/appointmentLetter';

const router = express.Router();
const connections = new Map<string, Promise<mongoose.Connection>>();
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true })).filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};
async function activeMongoUri(req: any) {
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  const uri = String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
  if (!uri) { const error: any = new Error('School MongoDB URI missing. Settings active MongoDB URI save korun.'); error.statusCode = 428; throw error; }
  return uri;
}
async function models(req: any) {
  const uri = await activeMongoUri(req);
  if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  const connection = await connections.get(uri)!;
  await connection.db.admin().ping();
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Teacher: model('Teacher', Teacher), Class: model('Class', ClassModel), Subject: model('Subject', Subject), IDCard: model('IDCard', IDCard) };
}
const normalizeTeacherRole = (value: any) => { const role = normalizeRole(value || 'subject_teacher'); return teacherRoles.includes(role) ? role : 'subject_teacher'; };
const normalizeList = (value: any) => Array.isArray(value) ? value.map((item) => String(item?._id || item?.name || item).trim()).filter(Boolean) : String(value || '').split(new RegExp('[,\\n]')).map((item) => item.trim()).filter(Boolean);
async function enrichTeachers(rows: any[]) {
  const plain = rows.map((row) => typeof row?.toObject === 'function' ? row.toObject() : row);
  const userIds = [...new Set(plain.map((row: any) => String(row.userId?._id || row.userId || '')).filter(Boolean))];
  const users = await primaryDb(() => User.find({ _id: { $in: userIds } }).select('name username email phone avatar role salary employeeId designation department qualification experience createdAt').lean());
  const userMap = new Map(users.map((user: any) => [String(user._id), user]));
  return plain.map((teacher: any) => ({ ...teacher, userId: typeof teacher.userId === 'object' && teacher.userId?.name ? teacher.userId : userMap.get(String(teacher.userId?._id || teacher.userId || '')) || teacher.userId }));
}
async function syncTeacherProfiles(req: any, M: any) {
  const users = await primaryDb(() => User.find({ institutionId: req.user.institutionId, role: { $in: teacherRoles }, isActive: { $ne: false } }).select('name username email phone avatar role salary employeeId designation department qualification experience createdAt').lean());
  const existing = await M.Teacher.find({ institutionId: req.user.institutionId, userId: { $in: users.map((u: any) => u._id) } }).select('userId').lean();
  const existingIds = new Set(existing.map((item: any) => String(item.userId)));
  const docs = users.filter((user: any) => !existingIds.has(String(user._id))).map((user: any, index: number) => ({ userId: user._id, employeeId: user.employeeId || `T-${String(index + 1).padStart(3, '0')}-${String(user._id).slice(-4)}`, designation: user.designation || (user.role === 'class_teacher' ? 'Class Teacher' : user.role === 'subject_teacher' ? 'Subject Teacher' : 'Teacher'), department: user.department || 'General', assignedClasses: [], subjects: [], joiningDate: user.createdAt || new Date(), qualification: user.qualification || 'Not specified', experience: Number(user.experience || 0), salary: Number(user.salary || 0), isActive: true, institutionId: req.user.institutionId }));
  if (docs.length) await M.Teacher.insertMany(docs, { ordered: false }).catch(() => undefined);
}
async function findOrCreateClasses(M: any, values: any[], institutionId: any) {
  const ids: any[] = [];
  for (const rawValue of values) {
    const raw = String(rawValue || '').trim();
    if (!raw) continue;
    let item: any = null;
    if (mongoose.Types.ObjectId.isValid(raw)) item = await M.Class.findOne({ _id: raw, institutionId });
    if (!item) item = await M.Class.findOne({ institutionId, name: raw });
    if (!item && !mongoose.Types.ObjectId.isValid(raw)) item = await M.Class.create({ institutionId, name: raw, grade: raw.match(/\d+/)?.[0] || raw, academicYear: String(new Date().getFullYear()), shift: 'day', isActive: true });
    if (item && !ids.some((id) => String(id) === String(item._id))) ids.push(item._id);
  }
  return ids;
}
async function findOrCreateSubjects(M: any, values: any[], institutionId: any, classIds: any[]) {
  const ids: any[] = [];
  for (const rawValue of values) {
    const raw = String(rawValue || '').trim();
    if (!raw) continue;
    let item: any = null;
    if (mongoose.Types.ObjectId.isValid(raw)) item = await M.Subject.findOne({ _id: raw, institutionId });
    if (!item) item = await M.Subject.findOne({ institutionId, name: raw });
    if (!item && classIds[0]) item = await M.Subject.create({ institutionId, name: raw, code: raw.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || `SUB${Date.now().toString().slice(-4)}`, type: 'core', classId: classIds[0], creditHours: 1, isActive: true });
    if (item && !ids.some((id) => String(id) === String(item._id))) ids.push(item._id);
  }
  return ids;
}
async function assertClassTeacherAvailable(M: any, institutionId: any, userId: any, classId: any) {
  const classDoc: any = await M.Class.findOne({ _id: classId, institutionId }).select('name classTeacherId').lean();
  if (!classDoc) { const error: any = new Error('Selected class not found in school database. Please reload classes and try again.'); error.statusCode = 404; throw error; }
  if (classDoc.classTeacherId && String(classDoc.classTeacherId) !== String(userId)) { const error: any = new Error(`This class already has a class teacher${classDoc.name ? `: ${classDoc.name}` : ''}. Remove/change existing class teacher first.`); error.statusCode = 409; throw error; }
}
async function assignClassTeacher(M: any, institutionId: any, userId: any, classId: any) {
  await assertClassTeacherAvailable(M, institutionId, userId, classId);
  await M.Class.updateMany({ institutionId, classTeacherId: userId, _id: { $ne: classId } }, { $unset: { classTeacherId: '' } });
  await M.Class.findOneAndUpdate({ _id: classId, institutionId }, { $set: { classTeacherId: userId } });
}
const createIdCard = async (M: any, teacherId: any, req: any, photoUrl?: string) => {
  const now = new Date(); const validityEnd = new Date(now); validityEnd.setFullYear(now.getFullYear() + 1); const cardNumber = `TEACHER-${Date.now()}-${String(teacherId).slice(-4)}`;
  return M.IDCard.create({ ownerId: teacherId, ownerType: 'teacher', cardNumber, cardType: 'standard', photoUrl, qrCodeData: cardNumber, barcodeData: cardNumber, validityStart: now, validityEnd, issuedBy: req.user._id, issuedAt: now, institutionId: req.user.institutionId });
};

router.use(authenticate);
router.get('/', async (req: any, res) => {
  try { const M = await models(req); await syncTeacherProfiles(req, M); const rows = await M.Teacher.find({ institutionId: req.user.institutionId, isActive: { $ne: false } }).populate('assignedClasses', 'name grade').populate('subjects', 'name code').sort({ createdAt: -1 }).lean(); res.json({ teachers: await enrichTeachers(rows), source: 'settings-active-mongodb-direct' }); }
  catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to load teachers', error }); }
});
router.post('/', async (req: any, res) => {
  try {
    if (!['admin', 'super_admin', 'head'].includes(req.user.role)) return res.status(403).json({ message: 'Only school head or admin can assign teachers' });
    const M = await models(req); await syncTeacherProfiles(req, M);
    const role = normalizeTeacherRole(req.body.role);
    if (role === 'class_teacher' && !String(req.body.classTeacherClassId || '').trim()) return res.status(400).json({ message: 'Class teacher role requires one class selection.' });
    const email = String(req.body.email || `${String(req.body.employeeId || Date.now()).toLowerCase()}@teacher.local`);
    const existing = await primaryDb(() => User.findOne({ email, institutionId: req.user.institutionId }));
    if (existing) return res.status(409).json({ message: 'A user with this email already exists' });
    const classInputs = normalizeList(req.body.assignedClasses);
    const classIds = await findOrCreateClasses(M, classInputs, req.user.institutionId);
    const classTeacherTargetClassId = role === 'class_teacher' ? classIds[0] : undefined;
    if (role === 'class_teacher' && !classTeacherTargetClassId) return res.status(400).json({ message: 'Class teacher class could not be resolved. Please select a class and try again.' });
    const username = await primaryDb(() => generateUsername(req.body.name, 'teacher'));
    const temporaryPassword = generatePassword();
    const user = await primaryDb(async () => User.create({ name: req.body.name, username, email, password: await hashPassword(temporaryPassword), role, phone: req.body.phone, avatar: req.body.photo, gender: req.body.gender, institutionId: req.user.institutionId }));
    if (role === 'class_teacher') await assertClassTeacherAvailable(M, req.user.institutionId, user._id, classTeacherTargetClassId);
    const subjectIds = await findOrCreateSubjects(M, normalizeList(req.body.subjects), req.user.institutionId, classIds);
    const teacher = await M.Teacher.create({ userId: user._id, employeeId: req.body.employeeId || `T-${Date.now()}`, designation: req.body.designation || (role === 'class_teacher' ? 'Class Teacher' : 'Teacher'), department: req.body.department || 'General', assignedClasses: classIds, subjects: subjectIds, joiningDate: req.body.joiningDate || new Date(), qualification: req.body.qualification || 'Not specified', experience: Number(req.body.experience) || 0, salary: Number(req.body.salary) || 0, institutionId: req.user.institutionId });
    if (role === 'class_teacher') await assignClassTeacher(M, req.user.institutionId, user._id, classTeacherTargetClassId);
    const idCard = req.body.autoIdCard !== false ? await createIdCard(M, teacher._id, req, req.body.photo) : null;
    if (req.body.phone) await sendSMS({ to: req.body.phone, message: buildCredentialSmsMessage({ summary: `${role === 'class_teacher' ? 'Class Teacher' : 'Teacher'} account created`, username, password: temporaryPassword }), institutionId: req.user.institutionId, recipientName: req.body.name, recipientPhone: req.body.phone, recipientType: 'teacher', type: 'credentials', purpose: 'teacher_credentials' }).catch((err) => console.error('Teacher credential SMS failed:', err));
    if (req.body.sendAppointmentLetter && req.body.email) {
      try { const institution = await primaryDb(() => Institution.findById(req.user.institutionId)); const appointmentLetterHtml = generateAppointmentLetter({ teacherName: req.body.name, position: req.body.designation, designation: req.body.designation, joiningDate: req.body.joiningDate ? new Date(req.body.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), departmentName: req.body.department, salary: Number(req.body.salary) || 0, qualification: req.body.qualification || 'Not specified', schoolName: institution?.name || 'School', schoolAddress: institution?.address || 'School Address', principalName: req.user.name || 'Principal', letterDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }); await sendEmail({ to: req.body.email, subject: `Appointment Letter - ${req.body.name}`, html: appointmentLetterHtml }); } catch (emailError) { console.error('Error sending appointment letter:', emailError); }
    }
    res.status(201).json({ teacher, user, idCard, credentials: { username, password: temporaryPassword } });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to create teacher', error: error?.message || error }); }
});
router.put('/:id', async (req: any, res) => {
  try {
    const M = await models(req); const rawId = String(req.params.id || ''); let teacher: any = null;
    if (rawId.startsWith('user-')) { const userId = rawId.replace(/^user-/, ''); await syncTeacherProfiles(req, M); teacher = await M.Teacher.findOne({ userId, institutionId: req.user.institutionId }); } else teacher = await M.Teacher.findOne({ _id: rawId, institutionId: req.user.institutionId });
    if (!teacher) return res.status(404).json({ message: 'Teacher profile not found' });
    const role = normalizeTeacherRole(req.body.role || req.body.userRole);
    if (role === 'class_teacher' && !String(req.body.classTeacherClassId || '').trim()) return res.status(400).json({ message: 'Class teacher role requires one class selection.' });
    const classIds = await findOrCreateClasses(M, normalizeList(req.body.assignedClasses), req.user.institutionId);
    const classTeacherTargetClassId = role === 'class_teacher' ? classIds[0] : undefined;
    if (role === 'class_teacher' && !classTeacherTargetClassId) return res.status(400).json({ message: 'Class teacher class could not be resolved. Please select a class and try again.' });
    if (role === 'class_teacher') await assertClassTeacherAvailable(M, req.user.institutionId, teacher.userId, classTeacherTargetClassId);
    const subjectIds = await findOrCreateSubjects(M, normalizeList(req.body.subjects), req.user.institutionId, classIds);
    await primaryDb(() => User.findByIdAndUpdate(teacher.userId, { name: req.body.name, email: req.body.email, phone: req.body.phone, avatar: req.body.photo, role, salary: Number(req.body.salary) || 0, employeeId: req.body.employeeId, designation: req.body.designation || (role === 'class_teacher' ? 'Class Teacher' : 'Teacher'), department: req.body.department || 'General', qualification: req.body.qualification, experience: Number(req.body.experience) || 0 }));
    teacher.employeeId = req.body.employeeId || teacher.employeeId; teacher.designation = req.body.designation || teacher.designation; teacher.department = req.body.department || teacher.department; teacher.assignedClasses = classIds; teacher.subjects = subjectIds; teacher.joiningDate = req.body.joiningDate || teacher.joiningDate; teacher.qualification = req.body.qualification || teacher.qualification; teacher.experience = Number(req.body.experience) || 0; teacher.salary = Number(req.body.salary) || 0; await teacher.save();
    if (role === 'class_teacher') await assignClassTeacher(M, req.user.institutionId, teacher.userId, classTeacherTargetClassId); else await M.Class.updateMany({ institutionId: req.user.institutionId, classTeacherId: teacher.userId }, { $unset: { classTeacherId: '' } });
    const updated = await M.Teacher.findById(teacher._id).populate('assignedClasses', 'name grade').populate('subjects', 'name code').lean(); const [enriched] = await enrichTeachers([updated]); res.json({ teacher: enriched, source: 'settings-active-mongodb-direct' });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to update teacher', error }); }
});
router.delete('/:id', async (req: any, res) => {
  try { const M = await models(req); const teacher = await M.Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId }); if (!teacher) return res.status(404).json({ message: 'Teacher not found' }); await primaryDb(() => User.findByIdAndUpdate(teacher.userId, { isActive: false })); await M.Class.updateMany({ institutionId: req.user.institutionId, classTeacherId: teacher.userId }, { $unset: { classTeacherId: '' } }); teacher.isActive = false; await teacher.save(); res.json({ message: 'Teacher deactivated', teacher }); }
  catch (error: any) { res.status(500).json({ message: 'Failed to delete teacher', error: error?.message || error }); }
});
export default router;
