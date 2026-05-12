import express from 'express';
import Institution from '../models/Institution';
import AdmissionApplication from '../models/AdmissionApplication';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Student from '../models/Student';
import User from '../models/User';
import Parent from '../models/Parent';
import { authenticate } from '../middleware/auth';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { sendSMS } from '../utils/sms';

const router = express.Router();

const canAcceptAdmission = (role: string) => ['head', 'assistant_head', 'class_teacher', 'subject_teacher'].includes(role);

const ensureClassAndSection = async (institutionId: any, className: string, sectionName = 'A') => {
  const classItem = await ClassModel.findOneAndUpdate(
    { institutionId, name: className },
    { $setOnInsert: { institutionId, name: className, grade: className, academicYear: String(new Date().getFullYear()), shift: 'day' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  const section = await Section.findOneAndUpdate(
    { institutionId, classId: classItem._id, name: sectionName },
    { $setOnInsert: { institutionId, classId: classItem._id, name: sectionName, capacity: 30, currentStudents: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  await ClassModel.findByIdAndUpdate(classItem._id, { $addToSet: { sections: section._id } });
  return { classId: classItem._id, sectionId: section._id };
};

router.get('/public/schools', async (req, res) => {
  const search = String(req.query.search || '').trim();
  const query: any = { isActive: true };
  if (search) query.$or = [
    { name: new RegExp(search, 'i') },
    { address: new RegExp(search, 'i') },
    { eiin: new RegExp(search, 'i') },
  ];
  const schools = await Institution.find(query).select('name type eiin address phone email website').sort({ name: 1 }).limit(100);
  res.json({ schools });
});

router.post('/public/apply', async (req, res) => {
  const application = await AdmissionApplication.create({
    institutionId: req.body.institutionId,
    studentName: req.body.studentName,
    guardianName: req.body.guardianName,
    guardianPhone: req.body.guardianPhone,
    guardianEmail: req.body.guardianEmail,
    dateOfBirth: req.body.dateOfBirth || undefined,
    address: req.body.address,
    previousSchool: req.body.previousSchool,
    previousResult: req.body.previousResult,
    requestedClass: req.body.requestedClass,
  });
  res.status(201).json({ application, message: 'Admission application submitted' });
});

router.get('/', authenticate, async (req: any, res) => {
  const applications = await AdmissionApplication.find({ institutionId: req.user.institutionId })
    .populate('institutionId', 'name')
    .sort({ createdAt: -1 });
  res.json({ applications });
});

router.post('/:id/accept', authenticate, async (req: any, res) => {
  if (!canAcceptAdmission(req.user.role)) return res.status(403).json({ message: 'Teacher or school leadership can accept admission' });
  const application = await AdmissionApplication.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
  if (!application) return res.status(404).json({ message: 'Application not found' });
  if (application.status !== 'pending') return res.status(400).json({ message: 'Application is already processed' });

  const username = await generateUsername(application.studentName, 'student');
  const password = generatePassword();
  const parentUsername = await generateUsername(application.guardianName, 'parent');
  const parentPassword = generatePassword();
  const email = req.body.email || application.guardianEmail || `${username}@student.local`;
  const { classId, sectionId } = await ensureClassAndSection(req.user.institutionId, req.body.className || application.requestedClass, req.body.sectionName || 'A');

  const user = await User.create({
    name: application.studentName,
    username,
    email,
    password: await hashPassword(password),
    role: 'student',
    phone: application.guardianPhone,
    institutionId: req.user.institutionId,
  });
  const parent = await User.create({
    name: application.guardianName,
    username: parentUsername,
    email: application.guardianEmail || `${parentUsername}@parent.local`,
    password: await hashPassword(parentPassword),
    role: 'parent',
    phone: application.guardianPhone,
    institutionId: req.user.institutionId,
  });
  const student = await Student.create({
    userId: user._id,
    rollNumber: req.body.rollNumber || `ADM-${Date.now()}`,
    classId,
    sectionId,
    admissionDate: new Date(),
    dateOfBirth: application.dateOfBirth || new Date('2000-01-01'),
    address: application.address,
    parentId: parent._id,
    guardianName: application.guardianName,
    guardianPhone: application.guardianPhone,
    guardianEmail: application.guardianEmail,
    subjects: [],
    institutionId: req.user.institutionId,
  });
  await Parent.create({
    userId: parent._id,
    children: [student._id],
    address: application.address,
    emergencyContact: application.guardianName,
    emergencyPhone: application.guardianPhone,
    institutionId: req.user.institutionId,
  });
  await Section.findByIdAndUpdate(sectionId, { $inc: { currentStudents: 1 } });
  application.status = 'accepted';
  application.acceptedBy = req.user._id;
  application.acceptedAt = new Date();
  application.studentId = student._id as any;
  await application.save();

  await sendSMS({ to: application.guardianPhone, message: `Admission accepted. Student username ${username}, password ${password}. Parent username ${parentUsername}, password ${parentPassword}` });
  res.json({ application, student, credentials: { username, password, parentUsername, parentPassword } });
});

router.post('/:id/reject', authenticate, async (req: any, res) => {
  if (!canAcceptAdmission(req.user.role)) return res.status(403).json({ message: 'Teacher or school leadership can reject admission' });
  const application = await AdmissionApplication.findOneAndUpdate(
    { _id: req.params.id, institutionId: req.user.institutionId },
    { status: 'rejected' },
    { new: true }
  );
  if (!application) return res.status(404).json({ message: 'Application not found' });
  res.json({ application });
});

export default router;
