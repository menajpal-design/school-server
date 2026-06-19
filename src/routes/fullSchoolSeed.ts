import express from 'express';
import bcrypt from 'bcryptjs';
import User from '../models/User';
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
import Exam from '../models/Exam';
import ClassRoutine from '../models/ClassRoutine';
import { authenticate, authorize } from '../middleware/auth';

const router = express.Router();
const currentYear = String(new Date().getFullYear());

const permissionsByRole: Record<string, string[]> = {
  assistant_head: ['manage:assignedArea', 'manage:academic', 'post:notice', 'generate:idcard', 'download:idcard'],
  class_teacher: ['manage:attendance', 'manage:class_students', 'manage:academic', 'propose:routine'],
  subject_teacher: ['manage:results', 'propose:routine'],
  teacher: ['manage:results', 'propose:routine'],
  finance_officer: ['manage:finance', 'view:payments', 'scan:idcard'],
  staff: ['manage:idcard', 'download:idcard', 'post:notice'],
  committee_member: ['post:notice'],
  student: ['view:own'],
  parent: ['view:child'],
};

const accounts = [
  { name: 'Assistant Head Sir', username: 'assistant.head', email: 'assistant.head@easyschool.demo', role: 'assistant_head', phone: '01700000002' },
  { name: 'Class Teacher Rahman', username: 'class.teacher', email: 'class.teacher@easyschool.demo', role: 'class_teacher', phone: '01700000003' },
  { name: 'Subject Teacher Karim', username: 'subject.teacher', email: 'subject.teacher@easyschool.demo', role: 'subject_teacher', phone: '01700000004' },
  { name: 'General Teacher Ayesha', username: 'teacher.ayesha', email: 'teacher.ayesha@easyschool.demo', role: 'teacher', phone: '01700000005' },
  { name: 'Finance Officer Hasan', username: 'finance.officer', email: 'finance@easyschool.demo', role: 'finance_officer', phone: '01700000006' },
  { name: 'Office Staff Jamal', username: 'staff.jamal', email: 'staff@easyschool.demo', role: 'staff', phone: '01700000007' },
  { name: 'Committee Member Alam', username: 'committee.alam', email: 'committee@easyschool.demo', role: 'committee_member', phone: '01700000008' },
  { name: 'Parent Demo One', username: 'parent.demo', email: 'parent.demo@easyschool.demo', role: 'parent', phone: '01700000009' },
  { name: 'Student Demo One', username: 'student.demo1', email: 'student1@easyschool.demo', role: 'student', phone: '01700000010' },
  { name: 'Student Demo Two', username: 'student.demo2', email: 'student2@easyschool.demo', role: 'student', phone: '01700000011' },
  { name: 'Student Demo Three', username: 'student.demo3', email: 'student3@easyschool.demo', role: 'student', phone: '01700000012' },
];

const cleanUsername = (value: string) => value.toLowerCase().replace(/[^a-z0-9._-]/g, '');
const dayStart = (date = new Date()) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const futureDate = (days: number) => { const date = dayStart(); date.setDate(date.getDate() + days); return date; };

async function upsertUser(input: any, institutionId: any, hashedSecret: string) {
  return User.findOneAndUpdate(
    { email: String(input.email).toLowerCase() },
    { $set: { name: input.name, username: cleanUsername(input.username), email: String(input.email).toLowerCase(), password: hashedSecret, role: input.role, phone: input.phone, isActive: true, permissions: permissionsByRole[input.role] || [], institutionId } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function upsertClass(name: string, grade: string, institutionId: any, teacherId: any) {
  const klass: any = await ClassModel.findOneAndUpdate({ name, institutionId }, { $set: { name, grade, shift: 'day', academicYear: currentYear, classTeacherId: teacherId, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  const section: any = await Section.findOneAndUpdate({ name: 'A', classId: klass._id, institutionId }, { $set: { name: 'A', classId: klass._id, sectionTeacherId: teacherId, capacity: 40, currentStudents: 0, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
  klass.sections = [section._id];
  await klass.save();
  return { klass, section };
}

router.post('/full-school', authenticate, authorize('admin', 'super_admin', 'head'), async (req: any, res) => {
  try {
    const institutionId = req.user.institutionId;
    const initialSecret = String(req.body.initialPassword || '').trim();
    if (initialSecret.length < 8) return res.status(400).json({ message: 'Please provide initialPassword with minimum 8 characters.' });
    const hashedSecret = await bcrypt.hash(initialSecret, 12);
    const users: Record<string, any> = {};

    for (const account of accounts) users[account.username] = await upsertUser(account, institutionId, hashedSecret);

    const assistant = users['assistant.head'];
    const classTeacher = users['class.teacher'];
    const subjectTeacher = users['subject.teacher'];
    const teacher = users['teacher.ayesha'];
    const finance = users['finance.officer'];
    const staff = users['staff.jamal'];
    const parent = users['parent.demo'];
    const student1 = users['student.demo1'];
    const student2 = users['student.demo2'];
    const student3 = users['student.demo3'];

    const classSix = await upsertClass('Class Six', '6', institutionId, classTeacher._id);
    const classSeven = await upsertClass('Class Seven', '7', institutionId, teacher._id);
    const classEight = await upsertClass('Class Eight', '8', institutionId, subjectTeacher._id);

    const baseSubjects = [['Bangla', 'BAN'], ['English', 'ENG'], ['Mathematics', 'MATH'], ['Science', 'SCI'], ['Bangladesh & Global Studies', 'BGS'], ['ICT', 'ICT'], ['Religion', 'REL']];
    const subjectMap: Record<string, any[]> = {};
    for (const classInfo of [classSix, classSeven, classEight]) {
      const list: any[] = [];
      for (const [subjectName, code] of baseSubjects) {
        const assignedTeacher = code === 'MATH' ? classTeacher._id : code === 'ENG' ? teacher._id : subjectTeacher._id;
        const subject: any = await Subject.findOneAndUpdate({ code: `${code}-${classInfo.klass.grade}`, institutionId }, { $set: { name: subjectName, code: `${code}-${classInfo.klass.grade}`, type: 'core', classId: classInfo.klass._id, teacherId: assignedTeacher, creditHours: 1, description: `${subjectName} for ${classInfo.klass.name}`, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
        list.push(subject);
      }
      classInfo.klass.subjects = list.map((item) => item._id);
      await classInfo.klass.save();
      subjectMap[classInfo.klass.name] = list;
    }

    await Teacher.findOneAndUpdate({ employeeId: 'T-1001', institutionId }, { $set: { userId: classTeacher._id, employeeId: 'T-1001', designation: 'Class Teacher', department: 'Mathematics', subjects: [subjectMap['Class Six'][2]._id], assignedClasses: [classSix.klass._id], joiningDate: new Date('2023-01-01'), qualification: 'B.Ed, M.Sc Mathematics', experience: 6, salary: 35000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Teacher.findOneAndUpdate({ employeeId: 'T-1002', institutionId }, { $set: { userId: subjectTeacher._id, employeeId: 'T-1002', designation: 'Subject Teacher', department: 'Science', subjects: [subjectMap['Class Six'][3]._id, subjectMap['Class Seven'][3]._id], assignedClasses: [classSix.klass._id, classSeven.klass._id], joiningDate: new Date('2022-02-01'), qualification: 'B.Sc Science', experience: 5, salary: 32000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Teacher.findOneAndUpdate({ employeeId: 'T-1003', institutionId }, { $set: { userId: teacher._id, employeeId: 'T-1003', designation: 'Senior Teacher', department: 'English', subjects: [subjectMap['Class Six'][1]._id, subjectMap['Class Seven'][1]._id], assignedClasses: [classSeven.klass._id], joiningDate: new Date('2021-03-01'), qualification: 'M.A English', experience: 8, salary: 38000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    await Staff.findOneAndUpdate({ employeeId: 'AH-1001', institutionId }, { $set: { userId: assistant._id, employeeId: 'AH-1001', designation: 'Assistant Head', department: 'Administration', joiningDate: new Date('2020-01-01'), salary: 45000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Staff.findOneAndUpdate({ employeeId: 'F-1001', institutionId }, { $set: { userId: finance._id, employeeId: 'F-1001', designation: 'Finance Officer', department: 'Accounts', joiningDate: new Date('2023-01-01'), salary: 28000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await Staff.findOneAndUpdate({ employeeId: 'S-1001', institutionId }, { $set: { userId: staff._id, employeeId: 'S-1001', designation: 'Office Assistant', department: 'Administration', joiningDate: new Date('2024-01-01'), salary: 18000, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    const studentInputs = [{ user: student1, rollNumber: '001', classInfo: classSix, dob: '2012-01-01', bloodGroup: 'B+' }, { user: student2, rollNumber: '002', classInfo: classSix, dob: '2012-02-05', bloodGroup: 'A+' }, { user: student3, rollNumber: '003', classInfo: classSeven, dob: '2011-03-10', bloodGroup: 'O+' }];
    const studentDocs: any[] = [];
    for (const input of studentInputs) {
      const subjects = subjectMap[input.classInfo.klass.name].map((item) => item._id);
      const student: any = await Student.findOneAndUpdate({ rollNumber: input.rollNumber, classId: input.classInfo.klass._id, institutionId }, { $set: { userId: input.user._id, rollNumber: input.rollNumber, classId: input.classInfo.klass._id, sectionId: input.classInfo.section._id, admissionDate: new Date(), dateOfBirth: new Date(input.dob), bloodGroup: input.bloodGroup, address: 'Student Address, Bangladesh', parentId: parent._id, guardianName: parent.name, guardianPhone: parent.phone, guardianEmail: parent.email, subjects, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      studentDocs.push(student);
    }

    await Parent.findOneAndUpdate({ userId: parent._id, institutionId }, { $set: { userId: parent._id, children: studentDocs.map((s) => s._id), occupation: 'Business', income: 30000, address: 'Parent Address, Bangladesh', emergencyContact: parent.name, emergencyPhone: parent.phone, institutionId, isActive: true } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    const routineDays = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
    const routineTimes = [['1', '08:00', '08:40'], ['2', '08:40', '09:20'], ['3', '09:20', '10:00'], ['4', '10:00', '10:40'], ['Break', '10:40', '11:00'], ['5', '11:00', '11:40'], ['6', '11:40', '12:20']];
    for (const classInfo of [classSix, classSeven]) {
      const subjectList = subjectMap[classInfo.klass.name];
      for (let d = 0; d < routineDays.length; d += 1) for (let p = 0; p < routineTimes.length; p += 1) {
        const [periodName, startTime, endTime] = routineTimes[p];
        const subject = periodName === 'Break' ? undefined : subjectList[(p + d) % subjectList.length];
        await ClassRoutine.findOneAndUpdate({ institutionId, classId: classInfo.klass._id, sectionId: classInfo.section._id, dayOfWeek: routineDays[d], periodName }, { $set: { classId: classInfo.klass._id, sectionId: classInfo.section._id, subjectId: subject?._id, teacherId: subject?.teacherId || classTeacher._id, dayOfWeek: routineDays[d], periodName, startTime, endTime, room: `Room ${classInfo.klass.grade}A`, note: periodName === 'Break' ? 'Break' : '', status: 'approved', approvedBy: req.user._id, approvedAt: new Date(), isActive: true, isPublic: true, institutionId, createdBy: req.user._id } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      }
    }

    for (const classInfo of [classSix, classSeven, classEight]) {
      const subjectList = subjectMap[classInfo.klass.name];
      await Exam.findOneAndUpdate({ institutionId, classId: classInfo.klass._id, name: `Final Examination ${currentYear}` }, { $set: { name: `Final Examination ${currentYear}`, type: 'final', classId: classInfo.klass._id, sectionId: classInfo.section._id, startDate: futureDate(20), endDate: futureDate(27), subjectMarks: subjectList.map((subject, index) => ({ subjectId: subject._id, date: futureDate(20 + index), duration: 120, totalMarks: 100, passingMarks: 33 })), approvalRequired: true, status: 'published', syllabus: 'Full syllabus as per academic plan.', instructions: 'Students must bring admit card and necessary stationery.', isPublished: true, createdBy: req.user._id, institutionId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    for (const student of studentDocs) {
      await Attendance.findOneAndUpdate({ institutionId, studentId: student._id, date: dayStart() }, { $set: { studentId: student._id, userId: student.userId, userType: 'student', classId: student.classId, sectionId: student.sectionId, date: dayStart(), status: 'present', markedBy: classTeacher._id, institutionId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
      await Fee.findOneAndUpdate({ institutionId, studentId: student._id, month: new Date().toLocaleString('en-US', { month: 'long' }), year: new Date().getFullYear(), type: 'monthly' }, { $set: { studentId: student._id, classId: student.classId, amount: 2500, type: 'monthly', month: new Date().toLocaleString('en-US', { month: 'long' }), year: new Date().getFullYear(), dueDate: futureDate(10), status: 'pending', collectedBy: finance._id, institutionId } }, { upsert: true, new: true, setDefaultsOnInsert: true });
    }

    await Notice.findOneAndUpdate({ institutionId, title: 'Final Exam Routine Published' }, { $set: { title: 'Final Exam Routine Published', content: 'Final examination routine and class routine are published for students and parents.', category: 'exam', priority: 'high', targetAudience: 'all', targetRoles: ['all'], isPublished: true, publishedAt: new Date(), postedBy: req.user._id, institutionId } }, { upsert: true, new: true, setDefaultsOnInsert: true });

    const userList = accounts.map((item) => ({ name: item.name, role: item.role, username: item.username, email: item.email }));
    res.json({ message: 'Full school data created for current institution.', summary: { users: accounts.length, classes: 3, sections: 3, subjects: 21, students: studentDocs.length, teachers: 3, staff: 3, routineCells: 84, exams: 3, fees: studentDocs.length, notices: 1 }, users: userList, note: 'All listed users use the initialPassword provided in this request.' });
  } catch (error: any) {
    res.status(500).json({ message: 'Full school seed failed', error: error?.message || error });
  }
});

export default router;
