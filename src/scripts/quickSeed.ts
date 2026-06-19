import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import connectDB from '../config/database';
import User from '../models/User';
import Institution from '../models/Institution';

dotenv.config();

const seedUsers = async () => {
  try {
    await connectDB();

    // Clear existing data
    console.log('🧹 Clearing existing data...');
    await User.deleteMany({});
    await Institution.deleteMany({});

    // Create a temporary institution ID placeholder
    const tempInstitutionId = new mongoose.Types.ObjectId();

    // Create head user
    const headPassword = await bcrypt.hash('admin123', 12);
    const headUser = new User({
      name: 'School Head',
      email: 'head@demoschool.edu',
      password: headPassword,
      role: 'head',
      phone: '+1234567890',
      isActive: true,
      permissions: ['all'],
      institutionId: tempInstitutionId
    });
    await headUser.save();
    console.log('✅ Created head user: head@demoschool.edu / admin123');

    // Create institution
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
    console.log('✅ Created institution: Demo School');

    // Update head user with correct institution ID
    headUser.institutionId = institution._id;
    await headUser.save();

    // Create sample teacher
    const teacherPassword = await bcrypt.hash('teacher123', 12);
    const teacher = new User({
      name: 'Sample Teacher',
      email: 'teacher@demoschool.edu',
      password: teacherPassword,
      role: 'subject_teacher',
      phone: '+9876543210',
      isActive: true,
      permissions: ['read_students', 'write_attendance', 'read_results'],
      institutionId: institution._id
    });
    await teacher.save();
    console.log('✅ Created teacher: teacher@demoschool.edu / teacher123');

    // Create sample student
    const studentPassword = await bcrypt.hash('student123', 12);
    const student = new User({
      name: 'Sample Student',
      email: 'student@demoschool.edu',
      password: studentPassword,
      role: 'student',
      phone: '+1111111111',
      isActive: true,
      permissions: ['read_profile', 'read_results', 'read_notices'],
      institutionId: institution._id
    });
    await student.save();
    console.log('✅ Created student: student@demoschool.edu / student123');

    console.log('\n✅ Database seeded successfully!');
    console.log('\n📋 Login Credentials:');
    console.log('  Head: head@demoschool.edu / admin123');
    console.log('  Teacher: teacher@demoschool.edu / teacher123');
    console.log('  Student: student@demoschool.edu / student123');

  } catch (error) {
    console.error('❌ Error seeding database:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

seedUsers();
