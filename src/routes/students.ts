import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import Student from '../models/Student';
import User from '../models/User';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import IDCard from '../models/IDCard';
import Parent from '../models/Parent';
import Fee from '../models/Fee';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { sendSMS } from '../utils/sms';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Student.find({ institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .populate('classId', 'name grade')
    .populate('sectionId', 'name')
    .populate('parentId', 'name email phone')
    .sort({ createdAt: -1 })
    .then((students) => res.json({ students }))
    .catch((error) => res.status(500).json({ message: 'Failed to load students', error }));
});

router.get('/:id', authenticate, (req, res) => {
  Student.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .populate('classId', 'name grade')
    .populate('sectionId', 'name')
    .populate('parentId', 'name email phone')
    .then((student) => {
      if (!student) return res.status(404).json({ message: 'Student not found' });
      res.json({ student });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load student', error }));
});

const ensureClassAndSection = async (req: any) => {
  const academicYear = String(req.body.academicYear || new Date().getFullYear());
  const className = String(req.body.className || req.body.class || 'New Class').trim();
  const sectionName = String(req.body.sectionName || req.body.section || 'A').trim();

  const classItem = await ClassModel.findOneAndUpdate(
    { name: className, institutionId: req.user.institutionId },
    {
      $setOnInsert: {
        grade: className,
        academicYear,
        shift: 'day',
        institutionId: req.user.institutionId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const section = await Section.findOneAndUpdate(
    { name: sectionName, classId: classItem._id, institutionId: req.user.institutionId },
    {
      $setOnInsert: {
        classId: classItem._id,
        capacity: 30,
        currentStudents: 0,
        institutionId: req.user.institutionId,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  await ClassModel.findByIdAndUpdate(classItem._id, { $addToSet: { sections: section._id } });
  return { classId: classItem._id, sectionId: section._id };
};

const createIdCard = async (ownerId: any, ownerType: 'student' | 'teacher' | 'staff', req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `${ownerType.toUpperCase()}-${Date.now()}-${String(ownerId).slice(-4)}`;

  return IDCard.create({
    ownerId,
    ownerType,
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
    const allowed = ['head', 'assistant_head', 'class_teacher', 'subject_teacher'];
    if (!allowed.includes(req.user.role)) return res.status(403).json({ message: 'Only teachers or school leadership can add students' });
    const email = String(req.body.email || `${String(req.body.rollNumber || Date.now()).toLowerCase()}@student.local`);
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'A user with this email already exists' });

    const username = await generateUsername(req.body.name, 'student');
    const temporaryPassword = generatePassword();
    const parentPassword = generatePassword();
    const user = await User.create({
      name: req.body.name,
      username,
      email,
      password: await hashPassword(temporaryPassword),
      role: 'student',
      phone: req.body.phone,
      avatar: req.body.photo,
      institutionId: req.user.institutionId,
    });

    const parentEmail = req.body.guardianEmail || `parent-${Date.now()}@parent.local`;
    let parent = await User.findOne({ email: parentEmail });
    if (req.body.autoParentAccount !== false && !parent) {
      parent = await User.create({
        name: req.body.guardianName,
        email: parentEmail,
        username: await generateUsername(req.body.guardianName, 'parent'),
        password: await hashPassword(parentPassword),
        role: 'parent',
        phone: req.body.guardianPhone,
        institutionId: req.user.institutionId,
      });
    }

    const { classId, sectionId } = await ensureClassAndSection(req);
    const student = await Student.create({
      userId: user._id,
      rollNumber: req.body.rollNumber,
      classId,
      sectionId,
      admissionDate: req.body.admissionDate || new Date(),
      dateOfBirth: req.body.dateOfBirth,
      bloodGroup: req.body.bloodGroup || undefined,
      address: req.body.address,
      parentId: parent?._id,
      guardianName: req.body.guardianName,
      guardianPhone: req.body.guardianPhone,
      guardianEmail: req.body.guardianEmail,
      subjects: [],
      institutionId: req.user.institutionId,
    });

    await Section.findByIdAndUpdate(sectionId, { $inc: { currentStudents: 1 } });
    if (parent) {
      await Parent.findOneAndUpdate(
        { userId: parent._id, institutionId: req.user.institutionId },
        {
          userId: parent._id,
          $addToSet: { children: student._id },
          occupation: req.body.parentOccupation,
          income: Number(req.body.parentIncome) || undefined,
          address: req.body.address || 'Not provided',
          emergencyContact: req.body.emergencyContact || req.body.guardianName || parent.name,
          emergencyPhone: req.body.emergencyPhone || req.body.guardianPhone || parent.phone || 'N/A',
          institutionId: req.user.institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    if (req.body.feeSetup || req.body.feeAmount) {
      await Fee.create({
        studentId: student._id,
        classId,
        amount: Number(req.body.feeAmount || req.body.feeSetup?.amount || 0),
        type: req.body.feeType || req.body.feeSetup?.type || 'monthly',
        month: req.body.feeMonth || req.body.feeSetup?.month || new Date().toLocaleString('en-US', { month: 'long' }),
        year: Number(req.body.feeYear || req.body.feeSetup?.year || new Date().getFullYear()),
        dueDate: req.body.feeDueDate || req.body.feeSetup?.dueDate || new Date(),
        collectedBy: req.user._id,
        institutionId: req.user.institutionId,
      });
    }
    let idCard = null;
    if (req.body.autoIdCard !== false) idCard = await createIdCard(student._id, 'student', req, req.body.photo);
    await sendSMS({
      to: req.body.phone || req.body.guardianPhone,
      message: `Student account for ${req.body.name}: username ${username}, password ${temporaryPassword}`,
    });

    res.status(201).json({ student, user, parent, idCard, credentials: { username, password: temporaryPassword, parentPassword: parent ? parentPassword : undefined } });
  } catch (error) {
    res.status(500).json({ message: 'Failed to admit student', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    const { classId, sectionId } = req.body.className || req.body.sectionName ? await ensureClassAndSection(req) : { classId: req.body.classId || student.classId, sectionId: req.body.sectionId || student.sectionId };
    await User.findByIdAndUpdate(student.userId, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      avatar: req.body.photo,
    });
    student.rollNumber = req.body.rollNumber || student.rollNumber;
    student.classId = classId;
    student.sectionId = sectionId;
    student.dateOfBirth = req.body.dateOfBirth || student.dateOfBirth;
    student.bloodGroup = req.body.bloodGroup || student.bloodGroup;
    student.address = req.body.address || student.address;
    student.guardianName = req.body.guardianName || student.guardianName;
    student.guardianPhone = req.body.guardianPhone || student.guardianPhone;
    student.guardianEmail = req.body.guardianEmail || student.guardianEmail;
    await student.save();
    res.json({ student });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update student', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const student = await Student.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!student) return res.status(404).json({ message: 'Student not found' });
    await User.findByIdAndUpdate(student.userId, { isActive: false });
    student.isActive = false;
    await student.save();
    res.json({ message: 'Student deactivated', student });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete student', error });
  }
});

export default router;
