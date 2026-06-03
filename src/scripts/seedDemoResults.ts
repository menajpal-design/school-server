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
import Exam from '../models/Exam';
import Result from '../models/Result';

dotenv.config();

const seedDemoResults = async () => {
  try {
    await connectDB();
    console.log('🌱 Connected to database for demo result seeding...');

    // 1. Find or create the Kanaipur High School institution
    const subdomain = 'school-b-6-10';
    let institution = await Institution.findOne({ subdomain });
    
    if (!institution) {
      institution = await Institution.create({
        name: 'KANAIPUR HIGH SCHOOL',
        type: 'school',
        eiin: '108785',
        address: 'Kanaipur, Faridpur Sadar, Faridpur',
        phone: '+8801700000000',
        email: 'info@kanaipurhighschool.edu.bd',
        website: 'school-b-6-10.localhost',
        domains: ['school-b-6-10.localhost'],
        subdomain: subdomain,
        isActive: true,
      });
      console.log('✅ Created Institution: KANAIPUR HIGH SCHOOL');
    } else {
      console.log('ℹ️ Institution KANAIPUR HIGH SCHOOL already exists');
    }

    // 2. Find or create the Admin Head user
    let headUser = await User.findOne({ email: 'head@kanaipurhighschool.edu.bd' });
    if (!headUser) {
      const hashedPassword = await bcrypt.hash('admin123', 12);
      headUser = await User.create({
        name: 'MD. HARUN OR RASHID',
        email: 'head@kanaipurhighschool.edu.bd',
        password: hashedPassword,
        role: 'head',
        phone: '+8801711111111',
        isActive: true,
        permissions: ['*'],
        institutionId: institution._id
      });
      console.log('✅ Created Head User: head@kanaipurhighschool.edu.bd / admin123');
    }
    
    // Update institution with headId
    if (!institution.headId) {
      institution.headId = headUser._id;
      await institution.save();
    }

    // 3. Find or create Class (SSC)
    let sscClass = await Class.findOne({ name: 'SSC', institutionId: institution._id });
    if (!sscClass) {
      sscClass = await Class.create({
        name: 'SSC',
        grade: '10',
        academicYear: '2026',
        isActive: true,
        institutionId: institution._id
      });
      console.log('✅ Created Class: SSC');
    }

    // 4. Find or create Section A
    let sectionA = await Section.findOne({ name: 'A', classId: sscClass._id, institutionId: institution._id });
    if (!sectionA) {
      sectionA = await Section.create({
        name: 'A',
        classId: sscClass._id,
        capacity: 40,
        currentStudents: 0,
        isActive: true,
        institutionId: institution._id
      });
      console.log('✅ Created Section: A');
    }

    // 5. Update Class sections list
    if (!sscClass.sections.includes(sectionA._id)) {
      sscClass.sections.push(sectionA._id);
      await sscClass.save();
    }

    // 6. Define subjects with standard BD codes
    const subjectsData = [
      { name: 'BANGLA', code: '101', type: 'core' },
      { name: 'ENGLISH', code: '107', type: 'core' },
      { name: 'MATHEMATICS', code: '109', type: 'core' },
      { name: 'BANGLADESH AND GLOBAL STUDIES', code: '150', type: 'core' },
      { name: 'ISLAM AND MORAL EDUCATION', code: '111', type: 'core' },
      { name: 'PHYSICS', code: '136', type: 'elective' },
      { name: 'CHEMISTRY', code: '137', type: 'elective' },
      { name: 'HIGHER MATHEMATICS', code: '126', type: 'optional' },
      { name: 'INFORMATION AND COMMUNICATION TECHNOLOGY', code: '154', type: 'core' },
      { name: 'BIOLOGY', code: '138', type: 'elective' },
      { name: 'PHYSICAL EDUCATION, HEALTH AND SPORTS', code: '147', type: 'core' },
      { name: 'CAREER EDUCATION', code: '156', type: 'core' }
    ];

    const subjectsMap = new Map();
    for (const sub of subjectsData) {
      let subjectObj = await Subject.findOne({ code: sub.code, classId: sscClass._id, institutionId: institution._id });
      if (!subjectObj) {
        subjectObj = await Subject.create({
          name: sub.name,
          code: sub.code,
          type: sub.type,
          classId: sscClass._id,
          creditHours: sub.code === '147' || sub.code === '156' ? 0.5 : 1,
          isActive: true,
          institutionId: institution._id
        });
        console.log(`✅ Created Subject: ${sub.name} (${sub.code})`);
      }
      subjectsMap.set(sub.code, subjectObj);
      
      if (!sscClass.subjects.includes(subjectObj._id)) {
        sscClass.subjects.push(subjectObj._id);
      }
    }
    await sscClass.save();

    // 7. Find or create Student MD. HRIDOY SHEIKH (Roll: 169946)
    let studentUser = await User.findOne({ username: 'hridoy169946', institutionId: institution._id });
    if (!studentUser) {
      const studentPassword = await bcrypt.hash('student123', 12);
      studentUser = await User.create({
        name: 'MD. HRIDOY SHEIKH',
        username: 'hridoy169946',
        email: 'hridoy@kanaipurhighschool.edu.bd',
        password: studentPassword,
        role: 'student',
        phone: '+8801722222222',
        gender: 'male',
        fatherName: 'MD. HARUN SHEIKH',
        motherName: 'NAZMA BEGUM',
        dateOfBirth: new Date('2003-11-15'),
        isActive: true,
        permissions: ['view:own', 'read_results', 'read_notices'],
        institutionId: institution._id
      });
      console.log('✅ Created Student User: MD. HRIDOY SHEIKH');
    }

    let studentRecord = await Student.findOne({ rollNumber: '169946', institutionId: institution._id });
    if (!studentRecord) {
      studentRecord = await Student.create({
        userId: studentUser._id,
        rollNumber: '169946',
        classId: sscClass._id,
        sectionId: sectionA._id,
        admissionDate: new Date('2017-01-01'),
        dateOfBirth: new Date('2003-11-15'),
        fatherName: 'MD. HARUN SHEIKH',
        motherName: 'NAZMA BEGUM',
        guardianName: 'MD. HARUN SHEIKH',
        guardianPhone: '+8801722222222',
        address: 'Kanaipur, Faridpur Sadar, Faridpur',
        isActive: true,
        institutionId: institution._id
      });
      console.log('✅ Created Student Record: Roll 169946');
    } else {
      studentRecord.classId = sscClass._id;
      studentRecord.sectionId = sectionA._id;
      await studentRecord.save();
      console.log('✅ Updated Student Record: Roll 169946 Class to SSC');
    }

    // 8. Find or create Exam (SSC Exam 2026)
    let examObj = await Exam.findOne({ name: 'SSC or Equivalent Examination', classId: sscClass._id, institutionId: institution._id });
    if (!examObj) {
      const subjectMarksSetup = Array.from(subjectsMap.values()).map((subject) => ({
        subjectId: subject._id,
        date: new Date('2026-02-02'),
        duration: 120,
        totalMarks: 100,
        passingMarks: 33
      }));

      examObj = await Exam.create({
        name: 'SSC or Equivalent Examination',
        type: 'final',
        classId: sscClass._id,
        startDate: new Date('2026-02-01'),
        endDate: new Date('2026-03-15'),
        subjectMarks: subjectMarksSetup,
        isPublished: true,
        status: 'published',
        createdBy: headUser._id,
        institutionId: institution._id
      });
      console.log('✅ Created Exam: SSC or Equivalent Examination');
    }

    // 9. Seeding Results for Hridoy (A-, A-, A+, A-, A, A+, A+, A+, A+, A+, A+, A+)
    const resultsData = [
      { code: '101', marks: 65, grade: 'A-' },  // BANGLA
      { code: '107', marks: 68, grade: 'A-' },  // ENGLISH
      { code: '109', marks: 95, grade: 'A+' },  // MATHEMATICS
      { code: '150', marks: 62, grade: 'A-' },  // BGS
      { code: '111', marks: 74, grade: 'A' },   // ISLAM
      { code: '136', marks: 88, grade: 'A+' },  // PHYSICS
      { code: '137', marks: 91, grade: 'A+' },  // CHEMISTRY
      { code: '126', marks: 93, grade: 'A+' },  // HIGHER MATHEMATICS
      { code: '154', marks: 85, grade: 'A+' },  // ICT
      { code: '138', marks: 89, grade: 'A+' },  // BIOLOGY
      { code: '147', marks: 90, grade: 'A+' },  // PHYSICAL EDUCATION
      { code: '156', marks: 92, grade: 'A+' }   // CAREER EDUCATION
    ];

    console.log('📝 Seeding Results...');
    for (const resItem of resultsData) {
      const subject = subjectsMap.get(resItem.code);
      if (!subject) continue;

      // Update or create result
      await Result.findOneAndUpdate(
        {
          studentId: studentRecord._id,
          examId: examObj._id,
          subjectId: subject._id,
          institutionId: institution._id
        },
        {
          studentId: studentRecord._id,
          examId: examObj._id,
          subjectId: subject._id,
          marksObtained: resItem.marks,
          grade: resItem.grade,
          isPassed: resItem.marks >= 33,
          workflowStatus: 'published',
          markedBy: headUser._id,
          markedAt: new Date(),
          publishedBy: headUser._id,
          publishedAt: new Date(),
          institutionId: institution._id
        },
        { upsert: true, new: true }
      );
      console.log(`  Added result: Subject ${resItem.code} -> Marks: ${resItem.marks} (Grade: ${resItem.grade})`);
    }

    console.log('🎉 Seeding completed successfully!');

  } catch (error) {
    console.error('❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

seedDemoResults();
