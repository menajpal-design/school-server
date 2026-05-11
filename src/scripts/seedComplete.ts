import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '../config/database';
import User from '../models/User';
import Institution from '../models/Institution';
import Class from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Parent from '../models/Parent';
import Attendance from '../models/Attendance';
import Fee from '../models/Fee';
import Salary from '../models/Salary';
import IDCard from '../models/IDCard';
import Notice from '../models/Notice';
import Notification from '../models/Notification';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Committee from '../models/Committee';

dotenv.config();

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear all collections
    const collections = [
      User, Institution, Class, Section, Subject, Student, Teacher, Staff,
      Parent, Attendance, Fee, Salary, IDCard, Notice, Notification, Exam,
      Result, Committee
    ];

    for (const model of collections as mongoose.Model<any>[]) {
      await model.deleteMany({});
    }
    console.log('🧹 Cleared all existing data');

    // 1. Create Institution
    const institution = await Institution.create({
      name: 'EasySchool Demo',
      type: 'school',
      eiin: '123456789',
      address: '123 Demo School Road, Education City',
      phone: '+88-01700-000000',
      email: 'admin@easyschool.edu',
      website: 'https://easyschool.edu',
      academicYear: '2024-2025',
      settings: {
        backupSettings: {
          frequency: 'weekly',
          location: 'local',
          collections: ['users', 'students', 'attendance', 'results', 'fees']
        }
      }
    });
    console.log('✅ Institution created');

    // 2. Create Users - Head
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const headUser = await User.create({
      name: 'Mr. Admin Head',
      email: 'head@easyschool.edu',
      password: hashedPassword,
      role: 'head',
      phone: '+88-01700-111111',
      isActive: true,
      permissions: ['*'],
      institutionId: institution._id
    });
    console.log('✅ Head user created');

    // Update institution with headId
    institution.headId = headUser._id;
    await institution.save();

    // 3. Create Classes and Sections
    const classData = [
      { name: 'Class 1', grade: '1' },
      { name: 'Class 2', grade: '2' },
      { name: 'Class 3', grade: '3' },
      { name: 'Class 4', grade: '4' },
      { name: 'Class 5', grade: '5' }
    ];

    const classes = [];
    for (const data of classData) {
      const cls = await Class.create({
        name: data.name,
        grade: data.grade,
        academicYear: '2024-2025',
        isActive: true,
        institutionId: institution._id
      });
      classes.push(cls);
    }
    console.log('✅ Classes created');

    // 4. Create Sections
    const sections = [];
    for (const cls of classes) {
      for (let i = 0; i < 2; i++) {
        const section = await Section.create({
          name: String.fromCharCode(65 + i), // A, B
          classId: cls._id,
          capacity: 40,
          currentStudents: 0,
          isActive: true,
          institutionId: institution._id
        });
        sections.push(section);
        cls.sections.push(section._id);
      }
      await cls.save();
    }
    console.log('✅ Sections created');

    // 5. Create Subjects
    const subjectNames = ['Bangla', 'English', 'Mathematics', 'Science', 'Social Studies', 'Islam', 'PE'];
    for (const cls of classes) {
      for (let i = 0; i < subjectNames.length; i++) {
        const subject = await Subject.create({
          name: subjectNames[i],
          code: `${subjectNames[i].slice(0, 3).toUpperCase()}${cls.grade}`,
          type: i < 5 ? 'core' : 'elective',
          classId: cls._id,
          creditHours: i < 5 ? 1 : 0.5,
          isActive: true,
          institutionId: institution._id
        });
        cls.subjects.push(subject._id);
      }
      await cls.save();
    }
    console.log('✅ Subjects created');

    // 6. Create Teachers
    const teacherNames = [
      { name: 'Mr. John Smith', email: 'john.smith@easyschool.edu', phone: '+88-01700-222222' },
      { name: 'Mrs. Sarah Johnson', email: 'sarah.johnson@easyschool.edu', phone: '+88-01700-222223' },
      { name: 'Mr. Mike Wilson', email: 'mike.wilson@easyschool.edu', phone: '+88-01700-222224' },
      { name: 'Mrs. Emma Davis', email: 'emma.davis@easyschool.edu', phone: '+88-01700-222225' },
      { name: 'Mr. Robert Brown', email: 'robert.brown@easyschool.edu', phone: '+88-01700-222226' }
    ];

    const teacherUsers = [];
    const teachers = [];
    const teacherPassword = await bcrypt.hash('teacher123', 12);

    for (const data of teacherNames) {
      const user = await User.create({
        name: data.name,
        email: data.email,
        password: teacherPassword,
        role: 'subject_teacher',
        phone: data.phone,
        isActive: true,
        permissions: ['manage:attendance', 'manage:results', 'read_students', 'download:idcard'],
        institutionId: institution._id
      });
      teacherUsers.push(user);

      const teacher = await Teacher.create({
        userId: user._id,
        subjectId: classes[0].subjects[0],
        classId: classes[0]._id,
        qualifications: 'B.A. in Education',
        experience: 5,
        joiningDate: new Date('2020-01-01'),
        isActive: true,
        institutionId: institution._id
      });
      teachers.push(teacher);
    }
    console.log('✅ Teachers created');

    // 7. Create Staff
    const staffNames = [
      { name: 'Mr. Admin Staff', email: 'staff.admin@easyschool.edu', phone: '+88-01700-333333' },
      { name: 'Mrs. Office Manager', email: 'staff.office@easyschool.edu', phone: '+88-01700-333334' },
      { name: 'Mr. Security Chief', email: 'staff.security@easyschool.edu', phone: '+88-01700-333335' }
    ];

    const staffUsers = [];
    const staffRecords = [];
    const staffPassword = await bcrypt.hash('staff123', 12);

    for (const data of staffNames) {
      const user = await User.create({
        name: data.name,
        email: data.email,
        password: staffPassword,
        role: 'staff',
        phone: data.phone,
        isActive: true,
        permissions: ['manage:idcard', 'download:idcard', 'read_reports'],
        institutionId: institution._id
      });
      staffUsers.push(user);

      const staff = await Staff.create({
        userId: user._id,
        designation: 'Support Staff',
        department: 'Administration',
        joiningDate: new Date('2019-01-01'),
        isActive: true,
        institutionId: institution._id
      });
      staffRecords.push(staff);
    }
    console.log('✅ Staff created');

    // 8. Create Parents and Students
    const studentData = [
      { name: 'Alice Brown', rollNumber: '001', section: 0, class: 0, parent: 'Mr. David Brown' },
      { name: 'Bob Green', rollNumber: '002', section: 0, class: 0, parent: 'Mrs. Lisa Green' },
      { name: 'Charlie White', rollNumber: '003', section: 1, class: 0, parent: 'Mr. Tom White' },
      { name: 'Diana Black', rollNumber: '004', section: 0, class: 1, parent: 'Mrs. Rachel Black' },
      { name: 'Eve Blue', rollNumber: '005', section: 1, class: 1, parent: 'Mr. Henry Blue' },
      { name: 'Frank Red', rollNumber: '006', section: 0, class: 2, parent: 'Mrs. Patricia Red' },
      { name: 'Grace Yellow', rollNumber: '007', section: 1, class: 2, parent: 'Mr. George Yellow' },
      { name: 'Henry Purple', rollNumber: '008', section: 0, class: 3, parent: 'Mrs. Mary Purple' }
    ];

    const studentUsers = [];
    const students = [];
    const parents = [];
    const studentPassword = await bcrypt.hash('student123', 12);
    const parentPassword = await bcrypt.hash('parent123', 12);

    for (const data of studentData) {
      // Create parent
      const parent = await Parent.create({
        name: data.parent,
        relation: 'Father',
        phone: '+88-01700-444444',
        email: `${data.parent.toLowerCase().replace(/\s/g, '.')}@easyschool.edu`,
        address: '123 Demo City',
        isActive: true,
        institutionId: institution._id
      });
      parents.push(parent);

      // Create parent user
      const parentUser = await User.create({
        name: data.parent,
        email: `${data.parent.toLowerCase().replace(/\s/g, '.')}@easyschool.edu`,
        password: parentPassword,
        role: 'parent',
        phone: '+88-01700-444444',
        isActive: true,
        permissions: ['view:child', 'read_results', 'read_notices'],
        institutionId: institution._id
      });

      // Create student user
      const studentUser = await User.create({
        name: data.name,
        email: `${data.name.toLowerCase().replace(/\s/g, '.')}@easyschool.edu`,
        password: studentPassword,
        role: 'student',
        phone: '+88-01700-555555',
        isActive: true,
        permissions: ['view:own', 'read_results', 'read_notices'],
        institutionId: institution._id
      });
      studentUsers.push(studentUser);

      // Create student record
      const student = await Student.create({
        userId: studentUser._id,
        rollNumber: data.rollNumber,
        classId: classes[data.class]._id,
        sectionId: classes[data.class].sections[data.section],
        admissionDate: new Date('2024-01-01'),
        parentIds: [parent._id],
        isActive: true,
        institutionId: institution._id
      });
      students.push(student);
    }
    console.log('✅ Students and Parents created');

    // 9. Create Attendance Records
    const today = new Date();
    for (const student of students) {
      for (let i = 0; i < 20; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        
        const attendance = await Attendance.create({
          studentId: student._id,
          classId: student.classId,
          sectionId: student.sectionId,
          date: date,
          status: Math.random() > 0.1 ? 'present' : (Math.random() > 0.5 ? 'absent' : 'late'),
          markedBy: teacherUsers[0]._id,
          institutionId: institution._id
        });
      }
    }
    console.log('✅ Attendance records created');

    // 10. Create Fee Records
    for (const student of students) {
      const months = ['January', 'February', 'March', 'April', 'May'];
      for (const month of months) {
        await Fee.create({
          studentId: student._id,
          amount: 5000,
          type: 'tuition',
          month: month,
          year: 2024,
          dueDate: new Date('2024-05-31'),
          status: Math.random() > 0.3 ? 'paid' : 'pending',
          collectedBy: staffUsers[0]._id,
          institutionId: institution._id
        });
      }
    }
    console.log('✅ Fee records created');

    // 11. Create Salary Records
    for (const teacher of teachers) {
      await Salary.create({
        employeeId: teacher._id,
        employeeType: 'teacher',
        basicSalary: 50000,
        allowances: { houseRent: 10000, medical: 2000, transport: 3000 },
        deductions: { tax: 5000 },
        grossSalary: 65000,
        netSalary: 60000,
        month: 'May',
        year: 2024,
        status: 'paid',
        processedBy: headUser._id,
        institutionId: institution._id
      });
    }
    console.log('✅ Salary records created');

    // 12. Create ID Cards
    for (const student of students) {
      await IDCard.create({
        ownerId: student._id,
        ownerType: 'student',
        cardNumber: `STU-2024-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`,
        cardType: 'student',
        validityStart: new Date('2024-01-01'),
        validityEnd: new Date('2025-12-31'),
        status: 'active',
        issuedBy: staffUsers[0]._id,
        issuedAt: new Date(),
        institutionId: institution._id
      });
    }
    console.log('✅ ID Cards created');

    // 13. Create Exams and Results
    const exam = await Exam.create({
      name: '1st Term Exam',
      type: 'term',
      startDate: new Date('2024-06-01'),
      endDate: new Date('2024-06-15'),
      classIds: [classes[0]._id],
      institutionId: institution._id
    });

    for (const student of students.slice(0, 5)) {
      for (const subject of classes[0].subjects.slice(0, 3)) {
        await Result.create({
          examId: exam._id,
          studentId: student._id,
          subjectId: subject,
          marks: Math.floor(Math.random() * 40) + 40,
          totalMarks: 100,
          grade: 'A',
          status: 'published',
          institutionId: institution._id
        });
      }
    }
    console.log('✅ Exams and Results created');

    // 14. Create Notices
    await Notice.create({
      title: 'Welcome to DRMS',
      category: 'general',
      content: 'Welcome to the Demo School Management System. This is a test notice.',
      priority: 'high',
      isPublished: true,
      publishedAt: new Date(),
      postedBy: headUser._id,
      institutionId: institution._id
    });

    await Notice.create({
      title: 'Exam Schedule',
      category: 'academic',
      content: 'Please refer to the academic calendar for exam schedules.',
      priority: 'medium',
      isPublished: true,
      publishedAt: new Date(),
      postedBy: teacherUsers[0]._id,
      institutionId: institution._id
    });
    console.log('✅ Notices created');

    // 15. Create Notifications
    await Notification.create({
      title: 'System Ready',
      body: 'DRMS system is ready for use',
      type: 'system',
      isRead: false,
      recipientId: null,
      institutionId: institution._id
    });
    console.log('✅ Notifications created');

    // 16. Create Committee
    await Committee.create({
      name: 'Academic Committee',
      type: 'academic',
      description: 'Oversees academic matters',
      members: [
        { userId: headUser._id, role: 'chair' },
        { userId: teacherUsers[0]._id, role: 'member' }
      ],
      isActive: true,
      institutionId: institution._id
    });
    console.log('✅ Committee created');

    console.log('\n✅ ====== DATABASE SEEDING COMPLETE ======\n');
    console.log('📋 DEMO LOGIN CREDENTIALS:\n');
    console.log('HEAD OF INSTITUTION:');
    console.log('  Email: head@easyschool.edu');
    console.log('  Password: admin123\n');
    console.log('TEACHER:');
    console.log('  Email: john.smith@easyschool.edu');
    console.log('  Password: teacher123\n');
    console.log('STAFF:');
    console.log('  Email: staff.admin@easyschool.edu');
    console.log('  Password: staff123\n');
    console.log('STUDENT:');
    console.log('  Email: alice.brown@easyschool.edu');
    console.log('  Password: student123\n');
    console.log('PARENT:');
    console.log('  Email: mr.david.brown@easyschool.edu');
    console.log('  Password: parent123\n');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    process.exit(0);
  }
};

seedDatabase();
