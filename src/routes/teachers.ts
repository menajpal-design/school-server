import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import Teacher from '../models/Teacher';
import User from '../models/User';
import ClassModel from '../models/Class';
import Subject from '../models/Subject';
import IDCard from '../models/IDCard';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { sendSMS } from '../utils/sms';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Teacher.find({ institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .populate('subjects', 'name code')
    .populate('assignedClasses', 'name grade')
    .sort({ createdAt: -1 })
    .then((teachers) => res.json({ teachers }))
    .catch((error) => res.status(500).json({ message: 'Failed to load teachers', error }));
});

router.get('/:id', authenticate, (req, res) => {
  Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .populate('subjects', 'name code')
    .populate('assignedClasses', 'name grade')
    .then((teacher) => {
      if (!teacher) return res.status(404).json({ message: 'Teacher not found' });
      res.json({ teacher });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load teacher', error }));
});

const findClasses = async (names: string[], institutionId: any) => {
  const ids = [];
  for (const name of names.filter(Boolean)) {
    const classItem = await ClassModel.findOne({ name: name.trim(), institutionId });
    if (classItem) ids.push(classItem._id);
  }
  return ids;
};

const findSubjects = async (names: string[], institutionId: any) => {
  const ids = [];
  for (const name of names.filter(Boolean)) {
    const subject = await Subject.findOne({ name: name.trim(), institutionId });
    if (subject) ids.push(subject._id);
  }
  return ids;
};

const createIdCard = async (teacherId: any, req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `TEACHER-${Date.now()}-${String(teacherId).slice(-4)}`;
  return IDCard.create({
    ownerId: teacherId,
    ownerType: 'teacher',
    cardNumber,
    cardType: 'standard',
    photoUrl,
    qrCodeData: cardNumber,
    barcodeData: cardNumber,
    validityStart: now,
    validityEnd,
    issuedBy: req.user._id,
    issuedAt: now,
    institutionId: req.user.institutionId,
  });
};

router.post('/', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'head') return res.status(403).json({ message: 'Only school head can assign teachers' });
    const email = String(req.body.email || `${String(req.body.employeeId || Date.now()).toLowerCase()}@teacher.local`);
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'A user with this email already exists' });
    const username = await generateUsername(req.body.name, 'teacher');
    const temporaryPassword = generatePassword();

    const user = await User.create({
      name: req.body.name,
      username,
      email,
      password: await hashPassword(temporaryPassword),
      role: 'subject_teacher',
      phone: req.body.phone,
      avatar: req.body.photo,
      institutionId: req.user.institutionId,
    });

    const teacher = await Teacher.create({
      userId: user._id,
      employeeId: req.body.employeeId || `T-${Date.now()}`,
      designation: req.body.designation,
      department: req.body.department,
      subjects: await findSubjects(String(req.body.subjects || '').split(','), req.user.institutionId),
      assignedClasses: await findClasses(String(req.body.assignedClasses || '').split(','), req.user.institutionId),
      joiningDate: req.body.joiningDate || new Date(),
      qualification: req.body.qualification || 'Not specified',
      experience: Number(req.body.experience) || 0,
      salary: Number(req.body.salary) || 0,
      institutionId: req.user.institutionId,
    });

    const idCard = req.body.autoIdCard !== false ? await createIdCard(teacher._id, req, req.body.photo) : null;
    if (req.body.phone) {
      await sendSMS({ to: req.body.phone, message: `Your teacher account: username ${username}, password ${temporaryPassword}`, institutionId: req.user.institutionId });
    }
    res.status(201).json({ teacher, user, idCard, credentials: { username, password: temporaryPassword } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create teacher', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const teacher = await Teacher.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!teacher) return res.status(404).json({ message: 'Teacher not found' });

    await User.findByIdAndUpdate(teacher.userId, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      avatar: req.body.photo,
    });

    teacher.employeeId = req.body.employeeId || teacher.employeeId;
    teacher.designation = req.body.designation;
    teacher.department = req.body.department;
    teacher.subjects = await findSubjects(String(req.body.subjects || '').split(','), req.user.institutionId) as any;
    teacher.assignedClasses = await findClasses(String(req.body.assignedClasses || '').split(','), req.user.institutionId) as any;
    teacher.joiningDate = req.body.joiningDate;
    teacher.qualification = req.body.qualification || teacher.qualification;
    teacher.experience = Number(req.body.experience) || 0;
    teacher.salary = Number(req.body.salary) || 0;
    await teacher.save();

    res.json({ teacher });
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
