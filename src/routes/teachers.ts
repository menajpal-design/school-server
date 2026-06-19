import express from 'express';
import { authenticate } from '../middleware/auth';
import Teacher from '../models/Teacher';
import User from '../models/User';
import ClassModel from '../models/Class';
import Subject from '../models/Subject';
import IDCard from '../models/IDCard';
import Institution from '../models/Institution';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';
import { sendEmail } from '../services/emailService';
import { generateAppointmentLetter } from '../utils/appointmentLetter';

const router = express.Router();
const teacherRoles = ['teacher', 'subject_teacher', 'class_teacher'];

const normalizeNameList = (value: any) => {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\n]/);
  return raw.map((item) => String(item).trim()).filter(Boolean);
};

const syncTeacherProfilesFromUsers = async (institutionId: any) => {
  const users = await User.find({ institutionId, role: { $in: teacherRoles }, isActive: { $ne: false } }).select('name email phone avatar role salary employeeId designation department qualification experience createdAt').lean();
  const userIds = users.map((user: any) => user._id);
  const existing = await Teacher.find({ institutionId, userId: { $in: userIds } }).select('userId').lean();
  const existingUserIds = new Set(existing.map((item: any) => String(item.userId)));
  const toCreate = users.filter((user: any) => !existingUserIds.has(String(user._id))).map((user: any, index: number) => ({
    userId: user._id,
    employeeId: user.employeeId || `T-${String(index + 1).padStart(3, '0')}-${String(user._id).slice(-4)}`,
    designation: user.designation || (user.role === 'class_teacher' ? 'Class Teacher' : user.role === 'subject_teacher' ? 'Subject Teacher' : 'Teacher'),
    department: user.department || 'General',
    assignedClasses: [],
    subjects: [],
    joiningDate: user.createdAt || new Date(),
    qualification: user.qualification || 'Not specified',
    experience: Number(user.experience || 0),
    salary: Number(user.salary || 0),
    isActive: true,
    institutionId,
  }));
  if (toCreate.length) await Teacher.insertMany(toCreate, { ordered: false }).catch(() => undefined);
};

router.get('/', authenticate, async (req, res) => {
  try {
    await syncTeacherProfilesFromUsers(req.user.institutionId);
    const teachers = await Teacher.find({ institutionId: req.user.institutionId, isActive: { $ne: false } })
      .populate('userId', 'name email phone avatar username')
      .populate('subjects', 'name code')
      .populate('assignedClasses', 'name grade')
      .sort({ createdAt: -1 });
    res.json({ teachers, syncedProfiles: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load teachers', error });
  }
});

router.get('/:id', authenticate, (req, res) => {
  Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar username')
    .populate('subjects', 'name code')
    .populate('assignedClasses', 'name grade')
    .then((teacher) => {
      if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
      res.json({ teacher });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load teacher', error }));
});

const findOrCreateClasses = async (names: string[], institutionId: any) => {
  const ids = [];
  for (const name of names.filter(Boolean)) {
    const trimmed = name.trim();
    let classItem = await ClassModel.findOne({ name: trimmed, institutionId });
    if (!classItem) {
      classItem = await ClassModel.create({ name: trimmed, grade: trimmed.match(/\d+/)?.[0] || trimmed, shift: 'day', academicYear: String(new Date().getFullYear()), isActive: true, institutionId });
    }
    ids.push(classItem._id);
  }
  return ids;
};

const findOrCreateSubjects = async (names: string[], institutionId: any, classIds: any[] = []) => {
  const ids = [];
  const primaryClassId = classIds[0];
  for (const name of names.filter(Boolean)) {
    const trimmed = name.trim();
    let subject = await Subject.findOne({ name: trimmed, institutionId });
    if (!subject && primaryClassId) {
      subject = await Subject.create({ name: trimmed, code: trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 10) || `SUB${Date.now().toString().slice(-4)}`, type: 'core', classId: primaryClassId, creditHours: 1, isActive: true, institutionId });
    }
    if (subject) ids.push(subject._id);
  }
  return ids;
};

const createIdCard = async (teacherId: any, req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `TEACHER-${Date.now()}-${String(teacherId).slice(-4)}`;
  return IDCard.create({ ownerId: teacherId, ownerType: 'teacher', cardNumber, cardType: 'standard', photoUrl, qrCodeData: cardNumber, barcodeData: cardNumber, validityStart: now, validityEnd, issuedBy: req.user._id, issuedAt: now, institutionId: req.user.institutionId });
};

router.post('/', authenticate, async (req, res) => {
  try {
    if (!['admin', 'super_admin', 'head'].includes(req.user.role)) return res.status(403).json({ message: 'Only school head or admin can assign teachers' });
    const email = String(req.body.email || `${String(req.body.employeeId || Date.now()).toLowerCase()}@teacher.local`);
    const existing = await User.findOne({ email, institutionId: req.user.institutionId });
    if (existing) return res.status(409).json({ message: 'A user with this email already exists' });
    const username = await generateUsername(req.body.name, 'teacher');
    const temporaryPassword = generatePassword();
    const user = await User.create({ name: req.body.name, username, email, password: await hashPassword(temporaryPassword), role: 'subject_teacher', phone: req.body.phone, avatar: req.body.photo, gender: req.body.gender, institutionId: req.user.institutionId });
    const classIds = await findOrCreateClasses(normalizeNameList(req.body.assignedClasses), req.user.institutionId);
    const teacher = await Teacher.create({ userId: user._id, employeeId: req.body.employeeId || `T-${Date.now()}`, designation: req.body.designation || 'Teacher', department: req.body.department || 'General', assignedClasses: classIds, subjects: await findOrCreateSubjects(normalizeNameList(req.body.subjects), req.user.institutionId, classIds), joiningDate: req.body.joiningDate || new Date(), qualification: req.body.qualification || 'Not specified', experience: Number(req.body.experience) || 0, salary: Number(req.body.salary) || 0, institutionId: req.user.institutionId });
    const idCard = req.body.autoIdCard !== false ? await createIdCard(teacher._id, req, req.body.photo) : null;
    if (req.body.phone) await sendSMS({ to: req.body.phone, message: buildCredentialSmsMessage({ summary: 'Teacher account created', username, password: temporaryPassword }), institutionId: req.user.institutionId, recipientName: req.body.name, recipientPhone: req.body.phone, type: 'notification' });
    if (req.body.sendAppointmentLetter && req.body.email) {
      try {
        const institution = await Institution.findById(req.user.institutionId);
        const appointmentLetterHtml = generateAppointmentLetter({ teacherName: req.body.name, position: req.body.designation, designation: req.body.designation, joiningDate: req.body.joiningDate ? new Date(req.body.joiningDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }), departmentName: req.body.department, salary: Number(req.body.salary) || 0, qualification: req.body.qualification || 'Not specified', schoolName: institution?.name || 'School', schoolAddress: institution?.address || 'School Address', principalName: req.user.name || 'Principal', letterDate: new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) });
        await sendEmail({ to: req.body.email, subject: `Appointment Letter - ${req.body.name}`, html: appointmentLetterHtml });
      } catch (emailError) { console.error('Error sending appointment letter:', emailError); }
    }
    res.status(201).json({ teacher, user, idCard, credentials: { username, password: temporaryPassword } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create teacher', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const rawId = String(req.params.id || '');
    if (rawId.startsWith('user-')) {
      await syncTeacherProfilesFromUsers(req.user.institutionId);
      const profile = await Teacher.findOne({ userId: rawId.replace(/^user-/, ''), institutionId: req.user.institutionId });
      if (!profile) return res.status(404).json({ message: 'Teacher profile not found for user' });
      req.params.id = String(profile._id);
    }
    const teacher = await Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    await User.findByIdAndUpdate(teacher.userId, { name: req.body.name, email: req.body.email, phone: req.body.phone, avatar: req.body.photo, salary: Number(req.body.salary) || 0, employeeId: req.body.employeeId, designation: req.body.designation, department: req.body.department, qualification: req.body.qualification, experience: Number(req.body.experience) || 0 });
    teacher.employeeId = req.body.employeeId || teacher.employeeId;
    teacher.designation = req.body.designation || teacher.designation;
    teacher.department = req.body.department || teacher.department;
    teacher.assignedClasses = await findOrCreateClasses(normalizeNameList(req.body.assignedClasses), req.user.institutionId) as any;
    teacher.subjects = await findOrCreateSubjects(normalizeNameList(req.body.subjects), req.user.institutionId, teacher.assignedClasses as any) as any;
    teacher.joiningDate = req.body.joiningDate || teacher.joiningDate;
    teacher.qualification = req.body.qualification || teacher.qualification;
    teacher.experience = Number(req.body.experience) || 0;
    teacher.salary = Number(req.body.salary) || 0;
    await teacher.save();
    const updated = await Teacher.findById(teacher._id).populate('userId', 'name email phone avatar username').populate('subjects', 'name code').populate('assignedClasses', 'name grade');
    res.json({ teacher: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update teacher', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
    await User.findByIdAndUpdate(teacher.userId, { isActive: false });
    teacher.isActive = false;
    await teacher.save();
    res.json({ message: 'Teacher deactivated', teacher });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete teacher', error });
  }
});

export default router;