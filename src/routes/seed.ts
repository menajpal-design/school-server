import express, { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
import Institution from '../models/Institution';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Parent from '../models/Parent';
import Attendance from '../models/Attendance';
import Fee from '../models/Fee';
import Notice from '../models/Notice';
import IDCard from '../models/IDCard';

const router = express.Router();

router.post('/seed', async (req: Request, res: Response) => {
  try {
    // Check if demo data already exists
    const existingUser = await User.findOne({ email: 'head@demoschool.edu' });
    if (existingUser) {
      return res.status(400).json({ message: 'Demo data already seeded' });
    }

    // Create institution first
    const institution = new Institution({
      name: 'Demo School',
      type: 'school',
      eiin: '123456',
      address: '123 School Street, City, Country',
      phone: '+1234567890',
      email: 'info@demoschool.edu',
      website: 'https://demoschool.edu',
      settings: {
        backupSettings: {
          frequency: 'weekly',
          location: 'local',
          collections: ['users', 'students', 'attendance', 'results']
        }
      }
    });

    // Temporarily set a placeholder for headId (will update after user creation)
    institution.headId = new (require('mongoose').Types.ObjectId)();
    await institution.save();

    // Create demo users
    const hashedPassword = await bcrypt.hash('admin123', 12);

    const demoUsers = [
      {
        name: 'School Head',
        email: 'head@demoschool.edu',
        password: hashedPassword,
        role: 'head',
        phone: '+1234567890',
        isActive: true,
        permissions: ['all'],
        institutionId: institution._id
      },
      {
        name: 'Demo Coordinator',
        email: 'coordinator@demoschool.edu',
        password: hashedPassword,
        role: 'assistant_head',
        phone: '+1234567891',
        isActive: true,
        permissions: ['manage:assignedArea', 'manage:academic'],
        institutionId: institution._id
      },
      {
        name: 'Test Student',
        email: 'student@demoschool.edu',
        password: hashedPassword,
        role: 'student',
        phone: '+1234567892',
        isActive: true,
        permissions: [],
        institutionId: institution._id
      }
    ];

    const createdUsers = await User.insertMany(demoUsers);
    
    // Update institution with head user ID
    institution.headId = createdUsers[0]._id;
    await institution.save();

    const classSix = await ClassModel.create({
      name: 'Class Six',
      grade: '6',
      shift: 'day',
      academicYear: String(new Date().getFullYear()),
      classTeacherId: createdUsers[1]._id,
      institutionId: institution._id,
    });
    const sectionA = await Section.create({ name: 'A', classId: classSix._id, capacity: 40, currentStudents: 1, institutionId: institution._id });
    classSix.sections = [sectionA._id] as any;
    await classSix.save();

    const teacherUser = await User.create({ name: 'Demo Teacher', email: 'teacher@demoschool.edu', password: hashedPassword, role: 'class_teacher', isActive: true, permissions: ['manage:academic', 'generate:idcard'], institutionId: institution._id });
    const staffUser = await User.create({ name: 'Demo Staff', email: 'staff@demoschool.edu', password: hashedPassword, role: 'staff', isActive: true, permissions: ['post:notice'], institutionId: institution._id });
    const parentUser = await User.create({ name: 'Demo Parent', email: 'parent@demoschool.edu', password: hashedPassword, role: 'parent', isActive: true, permissions: [], institutionId: institution._id });

    const subject = await Subject.create({ name: 'Mathematics', code: 'MATH-6', type: 'core', classId: classSix._id, teacherId: teacherUser._id, creditHours: 1, institutionId: institution._id });
    const teacher = await Teacher.create({ userId: teacherUser._id, employeeId: 'T-1001', designation: 'Class Teacher', department: 'Academic', subjects: [subject._id], assignedClasses: [classSix._id], joiningDate: new Date(), qualification: 'B.Ed', experience: 5, salary: 30000, institutionId: institution._id });
    const staff = await Staff.create({ userId: staffUser._id, employeeId: 'S-1001', designation: 'Office Assistant', department: 'Administration', joiningDate: new Date(), salary: 18000, institutionId: institution._id });
    const student = await Student.create({ userId: createdUsers[2]._id, rollNumber: '001', classId: classSix._id, sectionId: sectionA._id, admissionDate: new Date(), dateOfBirth: new Date('2012-01-01'), address: 'Demo Address', parentId: parentUser._id, guardianName: parentUser.name, guardianPhone: '+1234567893', subjects: [subject._id], institutionId: institution._id });
    await Parent.create({ userId: parentUser._id, children: [student._id], address: 'Demo Address', emergencyContact: parentUser.name, emergencyPhone: '+1234567893', institutionId: institution._id });
    await Attendance.create({ studentId: student._id, userId: createdUsers[2]._id, userType: 'student', classId: classSix._id, sectionId: sectionA._id, date: new Date(), status: 'present', markedBy: teacherUser._id, institutionId: institution._id });
    await Attendance.create({ userId: teacherUser._id, userType: 'teacher', date: new Date(), status: 'present', markedBy: createdUsers[0]._id, institutionId: institution._id });
    await Fee.create({ studentId: student._id, classId: classSix._id, amount: 1200, type: 'monthly', month: new Date().toLocaleString('en-US', { month: 'long' }), year: new Date().getFullYear(), dueDate: new Date(), status: 'pending', collectedBy: createdUsers[0]._id, institutionId: institution._id });
    await Notice.create({ title: 'Welcome to Demo School', content: 'This is a seeded notice.', category: 'general', priority: 'medium', targetAudience: 'all', targetRoles: ['all'], isPublished: true, publishedAt: new Date(), postedBy: createdUsers[0]._id, institutionId: institution._id });
    await IDCard.insertMany([
      { ownerId: createdUsers[2]._id, ownerType: 'student', cardNumber: `STU-${new Date().getFullYear()}-000001`, cardType: 'student', qrCodeData: 'seed-student-card', barcodeData: `STU-${new Date().getFullYear()}-000001`, validityStart: new Date(), validityEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), issuedBy: createdUsers[0]._id, issuedAt: new Date(), institutionId: institution._id },
      { ownerId: teacherUser._id, ownerType: 'teacher', cardNumber: `TCH-${new Date().getFullYear()}-000001`, cardType: 'teacher', qrCodeData: 'seed-teacher-card', barcodeData: `TCH-${new Date().getFullYear()}-000001`, validityStart: new Date(), validityEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), issuedBy: createdUsers[0]._id, issuedAt: new Date(), institutionId: institution._id },
      { ownerId: staffUser._id, ownerType: 'staff', cardNumber: `STF-${new Date().getFullYear()}-000001`, cardType: 'staff', qrCodeData: 'seed-staff-card', barcodeData: `STF-${new Date().getFullYear()}-000001`, validityStart: new Date(), validityEnd: new Date(new Date().setFullYear(new Date().getFullYear() + 1)), issuedBy: createdUsers[0]._id, issuedAt: new Date(), institutionId: institution._id },
    ]);

    res.json({
      message: 'Database seeded successfully',
      users: createdUsers.map(u => ({
        name: u.name,
        email: u.email,
        role: u.role,
        password: 'admin123' // Show for reference only
      }))
    });
  } catch (error) {
    res.status(500).json({ message: 'Seed error', error });
  }
});

export default router;
