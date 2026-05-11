import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '../config/database';
import User from '../models/User';
import Institution from '../models/Institution';
import Class from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';

dotenv.config();

const seedDatabase = async () => {
  try {
    await connectDB();

    // Clear existing data
    await User.deleteMany({});
    await Institution.deleteMany({});
    await Class.deleteMany({});
    await Section.deleteMany({});
    await Subject.deleteMany({});

    console.log('🧹 Cleared existing data');

    // Create a temporary institution ID placeholder
    const tempInstitutionId = new mongoose.Types.ObjectId();

    // Create head user with temp institution ID
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const headUser = new User({
      name: 'School Head',
      email: 'head@demoschool.edu',
      password: hashedPassword,
      role: 'head',
      phone: '+1234567890',
      isActive: true,
      permissions: ['all'],
      institutionId: tempInstitutionId
    });
    await headUser.save();
    console.log('👨‍🏫 Created head user');

    // Create sample institution with the head user ID
    const institution = new Institution({
      name: 'Demo School',
      type: 'school',
      eiin: '123456',
      address: '123 School Street, City, Country',
      phone: '+1234567890',
      email: 'info@demoschool.edu',
      website: 'https://demoschool.edu',
      headId: headUser._id,
      settings: {
        backupSettings: {
          frequency: 'weekly',
          location: 'local',
          collections: ['users', 'students', 'attendance', 'results']
        }
      }
    });
    await institution.save();
    console.log('🏫 Created institution');

    // Update head user with actual institution ID
    headUser.institutionId = institution._id;
    await headUser.save();


    // Create classes
    const classes = [];
    const classNames = ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5'];
    const grades = ['1', '2', '3', '4', '5'];

    for (let i = 0; i < classNames.length; i++) {
      const classDoc = new Class({
        name: classNames[i],
        grade: grades[i],
        academicYear: '2024-2025',
        isActive: true,
        institutionId: institution._id
      });
      await classDoc.save();
      classes.push(classDoc);
    }
    console.log('📚 Created classes');

    // Create sections for each class
    const sections = [];
    const sectionNames = ['A', 'B', 'C'];

    for (const classDoc of classes) {
      for (const sectionName of sectionNames) {
        const section = new Section({
          name: sectionName,
          classId: classDoc._id,
          capacity: 30,
          currentStudents: 0,
          isActive: true,
          institutionId: institution._id
        });
        await section.save();
        sections.push(section);

        // Add section to class
        classDoc.sections.push(section._id);
      }
      await classDoc.save();
    }
    console.log('📝 Created sections');

    // Create subjects
    const subjects = [
      { name: 'Bangla', code: 'BAN101', type: 'core' },
      { name: 'English', code: 'ENG101', type: 'core' },
      { name: 'Mathematics', code: 'MATH101', type: 'core' },
      { name: 'Science', code: 'SCI101', type: 'core' },
      { name: 'Social Studies', code: 'SOC101', type: 'core' },
      { name: 'Islam', code: 'ISL101', type: 'core' },
      { name: 'Physical Education', code: 'PE101', type: 'elective' }
    ];

    for (const subjectData of subjects) {
      for (const classDoc of classes) {
        const subject = new Subject({
          name: subjectData.name,
          code: `${subjectData.code}${classDoc.grade}`,
          type: subjectData.type,
          classId: classDoc._id,
          creditHours: subjectData.type === 'core' ? 1 : 0.5,
          isActive: true,
          institutionId: institution._id
        });
        await subject.save();

        // Add subject to class
        classDoc.subjects.push(subject._id);
        await classDoc.save();
      }
    }
    console.log('📖 Created subjects');

    // Create sample teachers
    const teachers = [
      { name: 'John Smith', email: 'john@demoschool.edu', subject: 'Mathematics' },
      { name: 'Sarah Johnson', email: 'sarah@demoschool.edu', subject: 'English' },
      { name: 'Mike Wilson', email: 'mike@demoschool.edu', subject: 'Science' },
      { name: 'Emma Davis', email: 'emma@demoschool.edu', subject: 'Bangla' }
    ];

    for (const teacherData of teachers) {
      const teacherPassword = await bcrypt.hash('teacher123', 12);
      const teacher = new User({
        name: teacherData.name,
        email: teacherData.email,
        password: teacherPassword,
        role: 'subject_teacher',
        phone: '+1234567890',
        isActive: true,
        permissions: ['read_students', 'write_attendance', 'read_results'],
        institutionId: institution._id
      });
      await teacher.save();
    }
    console.log('👨‍🏫 Created sample teachers');

    // Create sample students
    const students = [
      { name: 'Alice Brown', email: 'alice@demoschool.edu', rollNumber: '001', classIndex: 0, sectionIndex: 0 },
      { name: 'Bob Green', email: 'bob@demoschool.edu', rollNumber: '002', classIndex: 0, sectionIndex: 0 },
      { name: 'Charlie White', email: 'charlie@demoschool.edu', rollNumber: '003', classIndex: 0, sectionIndex: 1 },
      { name: 'Diana Black', email: 'diana@demoschool.edu', rollNumber: '004', classIndex: 1, sectionIndex: 0 },
      { name: 'Eve Blue', email: 'eve@demoschool.edu', rollNumber: '005', classIndex: 1, sectionIndex: 1 }
    ];

    for (const studentData of students) {
      const studentPassword = await bcrypt.hash('student123', 12);
      const student = new User({
        name: studentData.name,
        email: studentData.email,
        password: studentPassword,
        role: 'student',
        phone: '+1234567890',
        isActive: true,
        permissions: ['read_profile', 'read_results', 'read_notices'],
        institutionId: institution._id
      });
      await student.save();
    }
    console.log('👨‍🎓 Created sample students');

    console.log('✅ Database seeded successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('Head: head@demoschool.edu / admin123');
    console.log('Teachers: teacher@demoschool.edu / teacher123');
    console.log('Students: student@demoschool.edu / student123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

// Run seeder
seedDatabase();