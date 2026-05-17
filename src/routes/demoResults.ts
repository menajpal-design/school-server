import express from 'express';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';
import User from '../models/User';
import { authenticate } from '../middleware/auth';

const router = express.Router();

const bcryptHashForDemoPassword = '$2a$12$bP1e9JvVGdOCly3bRjFj1e3zIVc9LZ.Lm8YJR4i8N2V1INZp6K1J2';
const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin'];

const getGrade = (marks: number, total: number) => {
  const percentage = total ? (marks / total) * 100 : 0;
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

router.post('/first-terminal', authenticate, async (req: any, res) => {
  try {
    if (!manageRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Only Head/Assistant/Admin can create demo public result.' });
    }

    const institutionId = req.user.institutionId;
    const year = Number(req.body.year || new Date().getFullYear());
    const className = req.body.className || 'Class Six';
    const rollNumber = String(req.body.rollNumber || '101');
    const studentName = req.body.studentName || 'Demo Student One';

    let classItem = await ClassModel.findOne({ institutionId, name: className });
    if (!classItem) {
      classItem = await ClassModel.create({
        name: className,
        grade: '6',
        shift: 'day',
        academicYear: String(year),
        classTeacherId: req.user._id,
        sections: [],
        subjects: [],
        institutionId,
        isActive: true,
      });
    }

    let section = await Section.findOne({ institutionId, classId: classItem._id, name: 'A' });
    if (!section) {
      section = await Section.create({ name: 'A', classId: classItem._id, sectionTeacherId: req.user._id, capacity: 40, currentStudents: 0, institutionId, isActive: true });
      await ClassModel.findByIdAndUpdate(classItem._id, { $addToSet: { sections: section._id } });
    }

    const subjectDefs = [
      ['Bangla', 'BAN-6', 86],
      ['English', 'ENG-6', 82],
      ['Mathematics', 'MATH-6', 90],
      ['Science', 'SCI-6', 78],
      ['Bangladesh & Global Studies', 'BGS-6', 80],
      ['ICT', 'ICT-6', 88],
      ['Religion', 'REL-6', 91],
    ] as const;

    const subjects = [];
    for (const [name, code] of subjectDefs) {
      let subject = await Subject.findOne({ institutionId, classId: classItem._id, code });
      if (!subject) {
        subject = await Subject.create({ name, code, type: 'core', classId: classItem._id, teacherId: req.user._id, creditHours: 1, description: `${name} demo subject`, institutionId, isActive: true });
      }
      subjects.push(subject);
    }
    await ClassModel.findByIdAndUpdate(classItem._id, { $addToSet: { subjects: { $each: subjects.map((s) => s._id) } } });

    let studentUser = await User.findOne({ institutionId, username: 'demo.public.student' });
    if (!studentUser) {
      studentUser = await User.create({
        name: studentName,
        username: 'demo.public.student',
        email: `demo.public.student.${String(institutionId).slice(-6)}@easyschool.demo`,
        password: bcryptHashForDemoPassword,
        role: 'student',
        phone: '01710000101',
        isActive: true,
        permissions: ['view:own'],
        institutionId,
      });
    } else if (studentUser.name !== studentName) {
      studentUser.name = studentName;
      await studentUser.save();
    }

    let student = await Student.findOne({ institutionId, classId: classItem._id, rollNumber });
    if (!student) {
      student = await Student.create({
        userId: studentUser._id,
        rollNumber,
        classId: classItem._id,
        sectionId: section._id,
        admissionDate: new Date(`${year}-01-01T00:00:00.000Z`),
        dateOfBirth: new Date(`${year - 12}-01-01T00:00:00.000Z`),
        bloodGroup: 'B+',
        address: 'Demo Address, Bangladesh',
        guardianName: 'Demo Guardian',
        guardianPhone: '01710000100',
        guardianEmail: 'demo.guardian@easyschool.demo',
        subjects: subjects.map((s) => s._id),
        institutionId,
        isActive: true,
      });
      await Section.findByIdAndUpdate(section._id, { $inc: { currentStudents: 1 } });
    } else {
      student.userId = studentUser._id;
      student.sectionId = section._id;
      student.subjects = subjects.map((s) => s._id) as any;
      student.isActive = true;
      await student.save();
    }

    let exam = await Exam.findOne({ institutionId, classId: classItem._id, name: `1st Terminal Examination ${year}` });
    const subjectMarks = subjects.map((subject, index) => ({
      subjectId: subject._id,
      date: new Date(`${year}-04-${String(10 + index).padStart(2, '0')}T09:00:00.000Z`),
      duration: 120,
      totalMarks: 100,
      passingMarks: 33,
    }));
    if (!exam) {
      exam = await Exam.create({
        name: `1st Terminal Examination ${year}`,
        type: 'term',
        classId: classItem._id,
        sectionId: section._id,
        startDate: new Date(`${year}-04-10T00:00:00.000Z`),
        endDate: new Date(`${year}-04-16T00:00:00.000Z`),
        subjectMarks,
        approvalRequired: false,
        status: 'published',
        isPublished: true,
        syllabus: 'First terminal demo syllabus.',
        instructions: 'This is demo public result data.',
        createdBy: req.user._id,
        institutionId,
      });
    } else {
      exam.subjectMarks = subjectMarks as any;
      exam.status = 'published';
      exam.isPublished = true;
      await exam.save();
    }

    const resultRows = [];
    for (let i = 0; i < subjects.length; i += 1) {
      const subject = subjects[i];
      const marks = Number(subjectDefs[i][2]);
      const grade = getGrade(marks, 100);
      const result = await Result.findOneAndUpdate(
        { institutionId, studentId: student._id, examId: exam._id, subjectId: subject._id },
        {
          $set: {
            marksObtained: marks,
            grade,
            remarks: grade === 'F' ? 'Needs improvement' : 'Good',
            isPassed: marks >= 33,
            workflowStatus: 'published',
            assistantHeadApprovedBy: req.user._id,
            assistantHeadApprovedAt: new Date(),
            headApprovedBy: req.user._id,
            headApprovedAt: new Date(),
            publishedBy: req.user._id,
            publishedAt: new Date(),
            markedBy: req.user._id,
            markedAt: new Date(),
            institutionId,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      resultRows.push(result);
    }

    res.status(201).json({
      message: 'Demo 1st Terminal public result created successfully.',
      searchInfo: {
        publicResultRoute: '/result',
        className: classItem.name,
        classId: classItem._id,
        examName: exam.name,
        examId: exam._id,
        rollNumber: student.rollNumber,
        studentName,
      },
      created: {
        class: classItem,
        section,
        subjects: subjects.length,
        student,
        exam,
        results: resultRows.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: 'Failed to create demo 1st terminal public result', error: error?.message || error });
  }
});

export default router;
