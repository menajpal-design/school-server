import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageAcademic, normalizeRole } from '../middleware/auth';
import { resolveActorScope } from '../services/permissionPolicy';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Attendance from '../models/Attendance';
import IDCard from '../models/IDCard';
import Institution from '../models/Institution';
import Parent from '../models/Parent';
import { sendResultSMS } from '../utils/sms';

const router = express.Router();

const toObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

const allowAcademicOrViewers = (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const allowed = ['class_teacher', 'subject_teacher', 'assistant_head', 'teacher', 'head', 'student', 'parent'];
  if (allowed.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) {
    return next();
  }
  return res.status(403).json({ message: 'Access denied.' });
};

const populateClassQuery = () =>
  ClassModel.find()
    .populate('sections', 'name capacity currentStudents isActive')
    .populate('classTeacherId', 'name email phone role');

const populateSubjectQuery = () =>
  Subject.find()
    .populate('classId', 'name grade academicYear isActive')
    .populate('teacherId', 'name email phone role');

const populateExamQuery = () =>
  Exam.find()
    .populate('classId', 'name grade academicYear')
    .populate('sectionId', 'name')
    .populate('subjectId', 'name code')
    .populate('subjectMarks.subjectId', 'name code')
    .populate('createdBy', 'name email role');

const getClassesWithTotals = async (institutionId: any) => {
  const [classes, totals] = await Promise.all([
    populateClassQuery()
      .where({ institutionId })
      .sort({ createdAt: -1 })
      .lean(),
    Student.aggregate([
      { $match: { institutionId } },
      { $group: { _id: '$classId', totalStudents: { $sum: 1 } } },
    ]),
  ]);

  const totalByClass = new Map(totals.map((item: any) => [String(item._id), item.totalStudents]));
  return classes.map((classItem: any) => ({
    ...classItem,
    totalStudents: totalByClass.get(String(classItem._id)) || 0,
    status: classItem.isActive ? 'active' : 'inactive',
  }));
};

const normalizeSections = (sections: any[] = []) =>
  sections
    .filter((section) => section?.name?.trim())
    .map((section) => ({
      _id: section._id,
      name: section.name.trim(),
      capacity: Number(section.capacity) || 30,
      currentStudents: Number(section.currentStudents) || 0,
      isActive: section.isActive !== false,
    }));

const syncSections = async (classId: any, institutionId: any, sections: any[]) => {
  const incomingSections = normalizeSections(sections);
  const nextIds = [];

  for (const section of incomingSections) {
    if (section._id) {
      const updated = await Section.findOneAndUpdate(
        { _id: section._id, classId, institutionId },
        {
          name: section.name,
          capacity: section.capacity,
          currentStudents: section.currentStudents,
          isActive: section.isActive,
        },
        { new: true }
      );
      if (updated) nextIds.push(updated._id);
      continue;
    }

    const created = await Section.create({
      name: section.name,
      classId,
      capacity: section.capacity,
      currentStudents: section.currentStudents,
      isActive: section.isActive,
      institutionId,
    });
    nextIds.push(created._id);
  }

  if (incomingSections.length) {
    await Section.updateMany(
      { classId, institutionId, _id: { $nin: nextIds } },
      { isActive: false }
    );
  }

  return nextIds;
};

const syncSubjectTeacher = async (subjectId: any, classId: any, teacherId: any, institutionId: any) => {
  await Teacher.updateMany(
    { institutionId, subjects: subjectId },
    { $pull: { subjects: subjectId } }
  );

  if (!teacherId) return;

  await Teacher.findOneAndUpdate(
    { userId: teacherId, institutionId },
    { $addToSet: { subjects: subjectId, assignedClasses: classId } }
  );
};

const normalizeSubjectMarks = (items: any[] = []) =>
  items
    .filter((item) => item?.subjectId)
    .map((item) => ({
      subjectId: item.subjectId,
      date: item.date,
      duration: Number(item.duration) || 120,
      totalMarks: Number(item.totalMarks) || 100,
      passingMarks: Number(item.passingMarks) || 33,
    }));

const normalizeBulkItems = (input: any) => {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input?.items)) return input.items;
  return null;
};

const defaultSections = () => [{ name: 'A', capacity: 30, currentStudents: 0, isActive: true }];

const deriveGrade = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const digit = text.match(/\d+/)?.[0];
  return digit || text;
};

const deriveCode = (value: any) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const code = text
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 3))
    .join('');
  return code.slice(0, 10) || `SUB${Date.now().toString().slice(-4)}`;
};

const getGrade = (marks: number | undefined, totalMarks: number) => {
  if (marks === undefined || marks === null || Number.isNaN(marks)) return undefined;
  const percentage = totalMarks ? (marks / totalMarks) * 100 : 0;
  if (percentage >= 80) return 'A+';
  if (percentage >= 70) return 'A';
  if (percentage >= 60) return 'A-';
  if (percentage >= 50) return 'B';
  if (percentage >= 40) return 'C';
  if (percentage >= 33) return 'D';
  return 'F';
};

const getResultContext = async (req: any) => {
  const { classId, sectionId, examId, subjectId } = req.query;
  const query: any = { institutionId: req.user.institutionId, isActive: true };
  if (classId) query.classId = classId;
  if (sectionId) query.sectionId = sectionId;

  const [students, results, exam] = await Promise.all([
    Student.find(query)
      .populate('userId', 'name email')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1 })
      .lean(),
    examId && subjectId
      ? Result.find({ institutionId: req.user.institutionId, examId, subjectId })
          .populate('studentId', 'rollNumber')
          .lean()
      : Promise.resolve([]),
    examId
      ? Exam.findOne({ _id: examId, institutionId: req.user.institutionId })
          .populate('subjectMarks.subjectId', 'name code')
          .lean()
      : Promise.resolve(null),
  ]);

  const resultByStudent = new Map((results as any[]).map((result) => [String(result.studentId?._id || result.studentId), result]));
  const subjectSetup = (exam as any)?.subjectMarks?.find((item: any) => String(item.subjectId?._id || item.subjectId) === String(subjectId));
  const totalMarks = Number(subjectSetup?.totalMarks || (exam as any)?.totalMarks || 100);
  const passingMarks = Number(subjectSetup?.passingMarks || (exam as any)?.passingMarks || 33);
  const rows = students.map((student: any) => {
    const result = resultByStudent.get(String(student._id));
    return {
      studentId: student._id,
      resultId: result?._id,
      rollNumber: student.rollNumber,
      studentName: student.userId?.name || 'Unnamed student',
      section: student.sectionId?.name || '',
      marksObtained: result?.marksObtained,
      grade: result?.grade,
      remarks: result?.remarks || '',
      isPassed: result?.isPassed,
      workflowStatus: result?.workflowStatus || 'draft',
    };
  });

  const workflowStatuses = rows.map((row) => row.workflowStatus);
  const workflowStatus = workflowStatuses.includes('published')
    ? 'published'
    : workflowStatuses.includes('approved')
      ? 'approved'
      : workflowStatuses.includes('review')
        ? 'review'
        : 'draft';
  const missingMarks = rows.filter((row) => row.marksObtained === undefined || row.marksObtained === null || row.marksObtained === '').length;

  return {
    rows,
    exam,
    marksSetup: { totalMarks, passingMarks },
    workflowStatus,
    missingMarks,
  };
};

const updateResultWorkflow = async (req: any, workflowStatus: 'review' | 'approved' | 'published') => {
  const { examId, subjectId } = req.body;
  const filter = { institutionId: req.user.institutionId, examId, subjectId };
  const update: any = { workflowStatus };

  if (workflowStatus === 'approved' && req.body.approvalStage === 'assistant') {
    update.workflowStatus = 'review';
    update.assistantHeadApprovedBy = req.user._id;
    update.assistantHeadApprovedAt = new Date();
  }

  if (workflowStatus === 'approved' && req.body.approvalStage === 'head') {
    update.workflowStatus = 'approved';
    update.headApprovedBy = req.user._id;
    update.headApprovedAt = new Date();
  }

  if (workflowStatus === 'published') {
    update.publishedBy = req.user._id;
    update.publishedAt = new Date();
  }

  return Result.updateMany(filter, update);
};

const resolvePublicInstitution = async (req: any) => {
  if (req.institution?._id) return Institution.findOne({ _id: req.institution._id, isActive: true });
  if (req.query.institutionId) return Institution.findOne({ _id: req.query.institutionId, isActive: true });
  
  // Resolve by subdomain parameter or custom client header
  const clientSubdomain = String(req.query.subdomain || req.headers['x-client-subdomain'] || '').trim().toLowerCase();
  if (clientSubdomain && !['www', 'app', 'api', 'admin'].includes(clientSubdomain)) {
    const inst = await Institution.findOne({ subdomain: clientSubdomain, isActive: true });
    return inst || null;
  }

  const domain = String(req.query.domain || req.headers['x-client-domain'] || req.hostname || '').replace(/^www\./, '').toLowerCase();
  if (!domain) return null;
  return Institution.findOne({
    isActive: true,
    $or: [
      { website: new RegExp(domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      { domains: domain },
      { domains: `www.${domain}` },
    ],
  });
};

router.get('/public/results/schools', async (req, res) => {
  try {
    let tenantInstitution = (req as any).institution;
    const querySubdomain = String(req.query.subdomain || req.headers['x-client-subdomain'] || '').trim().toLowerCase();
    const hasRequestedSubdomain = Boolean(querySubdomain && !['www', 'app', 'api', 'admin'].includes(querySubdomain));
    const queryDomain = String(req.query.domain || req.headers['x-client-domain'] || '').trim().toLowerCase();
    const mainDomain = (process.env.MAIN_DOMAIN || 'easyschool.live').toLowerCase();
    const isMainDomainOrLocal = ['localhost', '127.0.0.1', mainDomain].includes(queryDomain);
    const isSpecificSearch = (querySubdomain && !['www', 'app', 'api', 'admin'].includes(querySubdomain)) || (queryDomain && !isMainDomainOrLocal);

    // Resolve by query param or header if not determined by the hostname middleware
    if (!tenantInstitution && isSpecificSearch) {
      if (hasRequestedSubdomain) {
        tenantInstitution = await Institution.findOne({ subdomain: querySubdomain, isActive: true }).lean();
        if (!tenantInstitution) {
          return res.json({ schools: [] });
        }
      } else if (queryDomain) {
        tenantInstitution = await Institution.findOne({
          isActive: true,
          $or: [
            { website: new RegExp(queryDomain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
            { domains: queryDomain },
            { domains: `www.${queryDomain}` },
          ]
        }).lean();
      }
    }

    if (tenantInstitution) {
      const school = await Institution.findOne({ _id: tenantInstitution._id, isActive: true })
        .select('name type eiin address website domains subdomain')
        .lean();
      return res.json({ schools: school ? [school] : [] });
    }

    if (isSpecificSearch) {
      return res.json({ schools: [] });
    }

    const search = String(req.query.search || '').trim();
    const query: any = { isActive: true };
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { eiin: new RegExp(search, 'i') },
        { address: new RegExp(search, 'i') },
      ];
    }
    const schools = await Institution.find(query)
      .select('name type eiin address website domains subdomain')
      .sort({ name: 1 })
      .limit(100)
      .lean();
    res.json({ schools });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load public schools', error });
  }
});


router.get('/public/results/options', async (req, res) => {
  try {
    const institution = await resolvePublicInstitution(req);
    if (!institution) return res.status(404).json({ message: 'School not found' });
    const [classes, exams] = await Promise.all([
      ClassModel.find({ institutionId: institution._id, isActive: true }).select('name grade academicYear').sort({ grade: 1 }).lean(),
      Exam.find({ institutionId: institution._id, isPublished: true }).select('name type classId startDate endDate').sort({ startDate: -1 }).lean(),
    ]);
    res.json({ institution, classes, exams });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load result options', error });
  }
});

router.get('/public/results', async (req, res) => {
  try {
    const institution = await resolvePublicInstitution(req);
    if (!institution) return res.status(404).json({ message: 'School not found' });

    const studentQuery: any = {
      institutionId: institution._id,
      isActive: true,
      rollNumber: String(req.query.rollNumber || '').trim(),
    };
    if (req.query.classId) studentQuery.classId = req.query.classId;
    if (!studentQuery.rollNumber) return res.status(400).json({ message: 'Roll number is required' });

    const student = await Student.findOne(studentQuery)
      .populate('userId', 'name gender fatherName motherName dateOfBirth')
      .populate('classId', 'name grade academicYear')
      .populate('sectionId', 'name')
      .lean();
    if (!student) return res.status(404).json({ message: 'No student found for this school, class and roll' });

    const resultQuery: any = {
      institutionId: institution._id,
      studentId: student._id,
      workflowStatus: 'published',
    };
    if (req.query.examId) resultQuery.examId = req.query.examId;

    const results = await Result.find(resultQuery)
      .populate({
        path: 'examId',
        select: 'name type totalMarks passingMarks subjectMarks classId startDate',
        populate: {
          path: 'classId',
          select: 'name grade academicYear'
        }
      })
      .populate('subjectId', 'name code')
      .sort({ publishedAt: -1, createdAt: -1 })
      .lean();
    if (!results.length) return res.status(404).json({ message: 'Published result not found' });

    // Helper function to match the exam type
    const matchExam = (result: any, searchExam: string) => {
      if (!searchExam) return true;
      const examName = String(result.examId?.name || '').toLowerCase();
      const className = String(result.examId?.classId?.name || '').toLowerCase();
      const classGrade = String(result.examId?.classId?.grade || '').toLowerCase();
      const search = searchExam.toLowerCase();

      if (search === 'jsc') {
        return examName.includes('jsc') || examName.includes('jdc') || 
               className.includes('jsc') || className.includes('jdc') || 
               className.includes('class 8') || className.includes('class-8') || className.includes('eight') ||
               classGrade === '8' || classGrade.includes('eight');
      }
      if (search === 'ssc') {
        return examName.includes('ssc') || examName.includes('dakhil') || 
               className.includes('ssc') || className.includes('dakhil') || 
               className.includes('class 10') || className.includes('class-10') || className.includes('ten') ||
               className.includes('class 9') || className.includes('class-9') || className.includes('nine') ||
               classGrade === '10' || classGrade === '9' || classGrade.includes('ten') || classGrade.includes('nine');
      }
      if (search === 'hsc') {
        return examName.includes('hsc') || examName.includes('alim') || 
               className.includes('hsc') || className.includes('alim') || 
               className.includes('class 12') || className.includes('class-12') || className.includes('twelve') ||
               className.includes('class 11') || className.includes('class-11') || className.includes('eleven') ||
               classGrade === '12' || classGrade === '11' || classGrade.includes('twelve') || classGrade.includes('eleven');
      }
      if (search === 'dibs') {
        return examName.includes('dibs') || className.includes('dibs') || classGrade.includes('dibs');
      }
      return true;
    };

    // Filter results by selected year and exam type if provided
    let filteredResults = results;
    const searchYear = String(req.query.year || '').trim();
    const searchExam = String(req.query.exam || '').trim();

    if (searchYear) {
      filteredResults = filteredResults.filter((result: any) => {
        const examYear = result.examId?.startDate ? new Date(result.examId.startDate).getFullYear().toString() : '';
        const classYear = result.examId?.classId?.academicYear?.toString() || '';
        return examYear === searchYear || classYear === searchYear;
      });
    }

    if (searchExam) {
      filteredResults = filteredResults.filter((result: any) => matchExam(result, searchExam));
    }

    if (!filteredResults.length) {
      return res.status(404).json({ message: 'No published results found for the selected examination and year' });
    }

    const totalObtained = filteredResults.reduce((sum: number, result: any) => sum + (Number(result.marksObtained) || 0), 0);
    const totalMarks = filteredResults.reduce((sum: number, result: any) => {
      const setup = result.examId?.subjectMarks?.find((item: any) => String(item.subjectId) === String(result.subjectId?._id || result.subjectId));
      return sum + Number(setup?.totalMarks || result.examId?.totalMarks || 100);
    }, 0);
    const percentage = totalMarks ? Math.round((totalObtained / totalMarks) * 100) : 0;

    // GPA Calculation
    const gradePoints: Record<string, number> = {
      'A+': 5,
      'A': 4,
      'A-': 3.5,
      'B': 3,
      'C': 2,
      'D': 1,
      'F': 0
    };
    
    let hasFailed = false;
    let totalPoints = 0;
    let subjectCount = 0;
    
    filteredResults.forEach((r: any) => {
      const g = String(r.grade || '').trim().toUpperCase();
      if (g) {
        if (g === 'F' || r.isPassed === false) {
          hasFailed = true;
        }
        const gp = gradePoints[g] || 0;
        totalPoints += gp;
        subjectCount++;
      }
    });
    
    let gpaText = 'F';
    if (subjectCount > 0) {
      if (hasFailed) {
        gpaText = 'FAILED';
      } else {
        const average = totalPoints / subjectCount;
        gpaText = `GPA=${average.toFixed(2)}`;
      }
    }

    // Format DOB to DD-MM-YYYY
    const formatDOB = (dateStr: any) => {
      if (!dateStr) return '';
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}-${mm}-${yyyy}`;
      } catch {
        return '';
      }
    };

    res.json({
      institution: {
        id: institution._id,
        name: institution.name,
        eiin: institution.eiin,
        address: institution.address,
      },
      student: {
        id: student._id,
        name: (student.userId as any)?.name || student.guardianName,
        rollNumber: student.rollNumber,
        className: (student.classId as any)?.name,
        sectionName: (student.sectionId as any)?.name,
        fatherName: student.fatherName || (student.userId as any)?.fatherName || '',
        motherName: student.motherName || (student.userId as any)?.motherName || '',
        dateOfBirth: formatDOB(student.dateOfBirth || (student.userId as any)?.dateOfBirth),
        gender: (student.userId as any)?.gender || '',
        bloodGroup: student.bloodGroup || (student.userId as any)?.bloodGroup || '',
        session: (student.classId as any)?.academicYear ? `${(student.classId as any).academicYear}-${Number((student.classId as any).academicYear) + 1 - 2000}` : '',
        group: (student.classId as any)?.name?.toUpperCase()?.includes('SCIENCE') ? 'SCIENCE' : (student.classId as any)?.name?.toUpperCase()?.includes('COMMERCE') ? 'COMMERCE' : (student.classId as any)?.name?.toUpperCase()?.includes('HUMANITIES') ? 'HUMANITIES' : 'GENERAL',
        admissionDate: student.admissionDate,
      },
      summary: {
        totalObtained,
        totalMarks,
        percentage,
        passed: !hasFailed,
        gpa: gpaText,
        examName: (filteredResults[0]?.examId as any)?.name || 'SSC or Equivalent Examination',
        examYear: (filteredResults[0]?.examId as any)?.startDate ? new Date((filteredResults[0].examId as any).startDate).getFullYear().toString() : searchYear,
        board: req.query.board ? String(req.query.board).toUpperCase() : 'DHAKA'
      },
      results: filteredResults.map((result: any) => ({
        examName: result.examId?.name,
        examType: result.examId?.type,
        subjectName: result.subjectId?.name,
        subjectCode: result.subjectId?.code || '',
        marksObtained: result.marksObtained,
        grade: result.grade,
        isPassed: result.isPassed,
        remarks: result.remarks,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load public result', error });
  }
});

router.get('/', authenticate, canManageAcademic(), (req, res) => {
  const institutionId = req.user.institutionId;
  Promise.all([
    ClassModel.find({ institutionId }).sort({ createdAt: -1 }),
    Subject.find({ institutionId }).sort({ createdAt: -1 }),
    Exam.find({ institutionId }).sort({ createdAt: -1 }),
    Result.find({ institutionId }).sort({ createdAt: -1 })
  ])
    .then(([classes, subjects, exams, results]) => {
      res.json({ classes, subjects, exams, results });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load academic data', error }));
});

router.get('/classes', authenticate, allowAcademicOrViewers, (req, res) => {
  getClassesWithTotals(req.user.institutionId)
    .then((classes) => res.json({ classes }))
    .catch((error) => res.status(500).json({ message: 'Failed to load classes', error }));
});

router.get('/classes/:id', authenticate, allowAcademicOrViewers, async (req, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (['teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
      const scope = await resolveActorScope(req.user);
      if (!scope.assignedClassIds.includes(req.params.id)) {
        return res.status(403).json({ message: 'Access denied. Not assigned to this class.' });
      }
    }
    const classItem = await populateClassQuery()
      .where({ _id: req.params.id, institutionId: req.user.institutionId })
      .findOne();
    if (!classItem) return res.status(404).json({ message: 'Class not found' });
    res.json({ classItem });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load class', error });
  }
});

router.get('/subjects', authenticate, allowAcademicOrViewers, (req, res) => {
  populateSubjectQuery()
    .where({ institutionId: req.user.institutionId })
    .sort({ createdAt: -1 })
    .then((subjects) => res.json({ subjects }))
    .catch((error) => res.status(500).json({ message: 'Failed to load subjects', error }));
});

router.get('/subjects/:id', authenticate, allowAcademicOrViewers, async (req, res) => {
  try {
    const subject = await populateSubjectQuery()
      .where({ _id: req.params.id, institutionId: req.user.institutionId })
      .findOne();
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    const role = normalizeRole(req.user.role);
    if (['teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
      const scope = await resolveActorScope(req.user);
      if (!scope.assignedSubjectIds.includes(req.params.id) && !scope.assignedClassIds.includes(String(subject.classId?._id || subject.classId))) {
        return res.status(403).json({ message: 'Access denied. Not assigned to this subject.' });
      }
    }
    res.json({ subject });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load subject', error });
  }
});

router.get('/exams', authenticate, allowAcademicOrViewers, async (req: any, res) => {
  try {
    const isAcademic = ['class_teacher', 'subject_teacher', 'assistant_head', 'teacher', 'head'].includes(req.user.role);
    const query: any = { institutionId: req.user.institutionId };
    
    if (!isAcademic) {
      query.isPublished = true;
      if (req.user.role === 'student') {
        const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('classId').lean();
        if (student) {
          query.classId = student.classId;
        } else {
          return res.json({ exams: [] });
        }
      } else if (req.user.role === 'parent') {
        const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('children').lean();
        const children = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] } }).select('classId').lean();
        if (children.length) {
          query.classId = { $in: children.map((c) => c.classId).filter(Boolean) };
        } else {
          return res.json({ exams: [] });
        }
      }
    }

    const exams = await populateExamQuery()
      .where(query)
      .sort({ createdAt: -1 });
    res.json({ exams });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exams', error });
  }
});

router.get('/exams/:id', authenticate, allowAcademicOrViewers, async (req: any, res) => {
  try {
    const isAcademic = ['class_teacher', 'subject_teacher', 'assistant_head', 'teacher', 'head'].includes(req.user.role);
    const query: any = { _id: req.params.id, institutionId: req.user.institutionId };
    
    if (!isAcademic) {
      query.isPublished = true;
      if (req.user.role === 'student') {
        const student = await Student.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('classId').lean();
        if (student) query.classId = student.classId;
        else return res.status(404).json({ message: 'Exam not found' });
      } else if (req.user.role === 'parent') {
        const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('children').lean();
        const children = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] } }).select('classId').lean();
        if (children.length) query.classId = { $in: children.map((c) => c.classId).filter(Boolean) };
        else return res.status(404).json({ message: 'Exam not found' });
      }
    }

    const exam = await populateExamQuery().where(query).findOne();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });
    res.json({ exam });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load exam', error });
  }
});

router.patch('/exams/:id/public-routine', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const subjectMarks = Array.isArray(exam.subjectMarks) ? exam.subjectMarks : [];
    const routineReady = subjectMarks.length > 0 && subjectMarks.every((item: any) => item.subjectId && item.date && item.duration);
    if (req.body.isPublished === true && !routineReady) {
      return res.status(409).json({ message: 'Routine is incomplete. Add subject, date and duration before making it public.' });
    }

    exam.isPublished = req.body.isPublished === true;
    if (exam.isPublished && exam.status === 'draft') exam.status = 'published';
    await exam.save();

    const updated = await populateExamQuery()
      .where({ _id: exam._id, institutionId: req.user.institutionId })
      .findOne();
    res.json({ exam: updated, message: exam.isPublished ? 'Exam routine is now public.' : 'Exam routine is now private.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update public exam routine status', error });
  }
});

router.get('/results', authenticate, canManageAcademic(), (req, res) => {
  if (req.query.classId || req.query.examId || req.query.subjectId) {
    getResultContext(req)
      .then((data) => res.json(data))
      .catch((error) => res.status(500).json({ message: 'Failed to load result entry data', error }));
    return;
  }

  Result.find({ institutionId: req.user.institutionId })
    .populate('studentId', 'rollNumber')
    .populate('examId', 'name type')
    .populate('subjectId', 'name code')
    .sort({ createdAt: -1 })
    .then((results) => res.json({ results }))
    .catch((error) => res.status(500).json({ message: 'Failed to load results', error }));
});

router.post('/results', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const exam: any = await Exam.findOne({ _id: req.body.examId, institutionId: req.user.institutionId }).lean();
    const setup = exam?.subjectMarks?.find((item: any) => String(item.subjectId) === String(req.body.subjectId));
    const totalMarks = Number(setup?.totalMarks || exam?.totalMarks || 100);
    const passingMarks = Number(setup?.passingMarks || exam?.passingMarks || 33);
    const marksObtained = req.body.marksObtained === undefined ? undefined : Number(req.body.marksObtained);
    const result = await Result.create({
      studentId: req.body.studentId,
      examId: req.body.examId,
      subjectId: req.body.subjectId,
      marksObtained,
      grade: req.body.grade || getGrade(marksObtained, totalMarks),
      remarks: req.body.remarks,
      isPassed: marksObtained !== undefined ? marksObtained >= passingMarks : undefined,
      workflowStatus: req.body.workflowStatus || 'draft',
      markedBy: req.user._id,
      markedAt: new Date(),
      institutionId: req.user.institutionId,
    });
    res.status(201).json({ result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create result', error });
  }
});

router.put('/results/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const result = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    const exam: any = await Exam.findOne({ _id: req.body.examId || result.examId, institutionId: req.user.institutionId }).lean();
    const setup = exam?.subjectMarks?.find((item: any) => String(item.subjectId) === String(req.body.subjectId || result.subjectId));
    const totalMarks = Number(setup?.totalMarks || exam?.totalMarks || 100);
    const passingMarks = Number(setup?.passingMarks || exam?.passingMarks || 33);
    const marksObtained = req.body.marksObtained === undefined ? result.marksObtained : Number(req.body.marksObtained);
    result.studentId = req.body.studentId || result.studentId;
    result.examId = req.body.examId || result.examId;
    result.subjectId = req.body.subjectId || result.subjectId;
    result.marksObtained = marksObtained;
    result.grade = req.body.grade || getGrade(marksObtained, totalMarks);
    result.remarks = req.body.remarks || result.remarks;
    result.isPassed = marksObtained !== undefined ? marksObtained >= passingMarks : result.isPassed;
    result.workflowStatus = req.body.workflowStatus || result.workflowStatus;
    await result.save();
    res.json({ result });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update result', error });
  }
});

router.delete('/results/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const result = await Result.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!result) return res.status(404).json({ message: 'Result not found' });
    await result.deleteOne();
    res.json({ message: 'Result deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete result', error });
  }
});

router.post('/results/draft', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const { examId, subjectId, rows = [] } = req.body;
    const exam: any = await Exam.findOne({ _id: examId, institutionId: req.user.institutionId }).lean();
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const subjectSetup = exam.subjectMarks?.find((item: any) => String(item.subjectId) === String(subjectId));
    const totalMarks = Number(subjectSetup?.totalMarks || exam.totalMarks || 100);
    const passingMarks = Number(subjectSetup?.passingMarks || exam.passingMarks || 33);

    for (const row of rows) {
      const hasMarks = row.marksObtained !== '' && row.marksObtained !== undefined && row.marksObtained !== null;
      const marksObtained = hasMarks ? Number(row.marksObtained) : undefined;
      await Result.findOneAndUpdate(
        {
          studentId: row.studentId,
          examId,
          subjectId,
          institutionId: req.user.institutionId,
        },
        {
          studentId: row.studentId,
          examId,
          subjectId,
          marksObtained,
          grade: getGrade(marksObtained, totalMarks),
          remarks: row.remarks || '',
          isPassed: hasMarks ? marksObtained! >= passingMarks : undefined,
          workflowStatus: 'draft',
          markedBy: req.user._id,
          markedAt: new Date(),
          institutionId: req.user.institutionId,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const data = await getResultContext({ ...req, query: { classId: req.body.classId, sectionId: req.body.sectionId, examId, subjectId } });
    res.json({ message: 'Draft saved', ...data });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save result draft', error });
  }
});

router.post('/results/submit-review', authenticate, canManageAcademic(), async (req, res) => {
  try {
    await updateResultWorkflow(req, 'review');
    res.json({ message: 'Results submitted for review' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to submit results for review', error });
  }
});

router.post('/results/assistant-approve', authenticate, canManageAcademic(), async (req, res) => {
  try {
    await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'assistant' } }, 'approved');
    res.json({ message: 'Assistant Head approval saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve results', error });
  }
});

router.post('/results/head-approve', authenticate, canManageAcademic(), async (req, res) => {
  try {
    await updateResultWorkflow({ ...req, body: { ...req.body, approvalStage: 'head' } }, 'approved');
    res.json({ message: 'Head approval saved' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to approve results', error });
  }
});

router.post('/results/publish', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const data = await getResultContext({ ...req, query: req.body });
    if (data.missingMarks > 0) {
      return res.status(409).json({ message: 'Cannot publish while required subject marks are missing.', missingMarks: data.missingMarks });
    }

    const hasUnapproved = data.rows.some((row: any) => row.workflowStatus !== 'approved' && row.workflowStatus !== 'published');
    if (hasUnapproved) {
      return res.status(409).json({ message: 'Head approval is required before publishing.' });
    }

    await updateResultWorkflow(req, 'published');
    const studentIds = Array.from(new Set((data.rows || []).map((row: any) => String(row.studentId)).filter(Boolean)));
    const students = await Student.find({ _id: { $in: studentIds }, institutionId: req.user.institutionId })
      .populate('userId', 'name')
      .lean();
    const studentMap = new Map(students.map((student: any) => [String(student._id), student]));
    for (const row of data.rows || []) {
      const student = studentMap.get(String(row.studentId));
      if (!student?.guardianPhone) continue;
      const studentName = row.studentName || (student as any).userId?.name || student.guardianName || 'Student';
      const summary = `${row.grade || 'N/A'} grade published${row.marksObtained !== undefined && row.marksObtained !== null ? `, marks ${row.marksObtained}` : ''}`;
      await sendResultSMS(student.guardianPhone, studentName, summary, req.user.institutionId);
    }
    res.json({ message: 'Results published' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to publish results', error });
  }
});

router.get('/report-card', authenticate, async (req, res) => {
  try {
    const institutionId = req.user.institutionId;
    const studentQuery: any = { institutionId };
    const userRole = normalizeRole(req.user.role);

    if (userRole === 'student') {
      studentQuery.userId = req.user._id;
      if (req.query.studentId) {
        const student = await Student.findOne({ userId: req.user._id, institutionId }).lean();
        if (!student || String(student._id) !== String(req.query.studentId)) {
          return res.status(403).json({ message: 'Access denied. You can only view your own report card.' });
        }
      }
    } else if (userRole === 'parent') {
      const parent = await Parent.findOne({ userId: req.user._id, institutionId }).lean();
      const childIds = (parent?.children || []).map(String);
      const targetId = req.query.studentId ? String(req.query.studentId) : childIds[0];
      if (!targetId || !childIds.includes(targetId)) {
        return res.status(403).json({ message: 'Access denied. You can only view report cards for your linked children.' });
      }
      studentQuery._id = targetId;
    } else if (['teacher', 'class_teacher', 'subject_teacher'].includes(userRole)) {
      const scope = await resolveActorScope(req.user);
      if (req.query.studentId) {
        const student = await Student.findOne({ _id: req.query.studentId, institutionId }).lean();
        if (!student || !scope.assignedClassIds.includes(String(student.classId))) {
          return res.status(403).json({ message: 'Access denied. Student class is not assigned to you.' });
        }
        studentQuery._id = req.query.studentId;
      } else {
        return res.status(400).json({ message: 'Student ID is required for teachers.' });
      }
    } else {
      if (req.query.studentId) studentQuery._id = req.query.studentId;
      else return res.status(400).json({ message: 'Student ID is required.' });
    }

    if (req.query.classId) studentQuery.classId = req.query.classId;
    if (req.query.sectionId) studentQuery.sectionId = req.query.sectionId;

    const student = await Student.findOne(studentQuery)
      .populate('userId', 'name email phone avatar')
      .populate('classId', 'name grade academicYear')
      .populate('sectionId', 'name');
    if (!student) {
      return res.status(404).json({ message: 'Report card not found for current user' });
    }

      const examId = req.query.examId;
      const resultQuery: any = { institutionId, studentId: student._id };
      if (examId) resultQuery.examId = examId;

      const [results, attendance, idCard] = await Promise.all([
        Result.find(resultQuery)
          .populate('examId', 'name type totalMarks passingMarks subjectMarks')
          .populate('subjectId', 'name code')
          .sort({ createdAt: -1 }),
        Attendance.find({ institutionId, studentId: student._id }).lean(),
        IDCard.findOne({ institutionId, ownerId: student._id, ownerType: 'student' }).sort({ createdAt: -1 }).lean(),
      ]);

      const totalObtained = results.reduce((sum: number, result: any) => sum + (Number(result.marksObtained) || 0), 0);
      const totalMarks = results.reduce((sum: number, result: any) => {
        const setup = result.examId?.subjectMarks?.find((item: any) => String(item.subjectId) === String(result.subjectId?._id || result.subjectId));
        return sum + Number(setup?.totalMarks || result.examId?.totalMarks || 100);
      }, 0);
      const percentage = totalMarks ? Math.round((totalObtained / totalMarks) * 100) : 0;
      const gpa = percentage >= 80 ? 5 : percentage >= 70 ? 4 : percentage >= 60 ? 3.5 : percentage >= 50 ? 3 : percentage >= 40 ? 2 : percentage >= 33 ? 1 : 0;
      const attendanceSummary = {
        total: attendance.length,
        present: attendance.filter((item: any) => item.status === 'present').length,
        absent: attendance.filter((item: any) => item.status === 'absent').length,
        late: attendance.filter((item: any) => item.status === 'late').length,
        leave: attendance.filter((item: any) => item.status === 'leave').length,
      };

      res.json({
        reportCard: {
          studentId: student._id,
          studentName: (student.userId as any)?.name,
          rollNumber: student.rollNumber,
          className: (student.classId as any)?.name,
          sectionName: (student.sectionId as any)?.name,
          examName: (results[0]?.examId as any)?.name || 'Selected Exam',
          grade: results[0]?.grade || 'N/A',
          gpa,
          percentage,
          position: results.length ? 1 : null,
          teacherRemarks: percentage >= 80 ? 'Excellent performance.' : percentage >= 50 ? 'Good progress with room to improve.' : 'Needs focused support.',
          idCard: {
            cardNumber: idCard?.cardNumber,
            photoUrl: idCard?.photoUrl || (student.userId as any)?.avatar,
          },
          attendanceSummary,
          subjects: results.map((result: any) => ({
            name: result.subjectId?.name || result.examId?.name || 'Unknown',
            code: result.subjectId?.code || '',
            marks: result.marksObtained,
            grade: result.grade,
            gpa: result.grade === 'A+' ? 5 : result.grade === 'A' ? 4 : result.grade === 'A-' ? 3.5 : result.grade === 'B' ? 3 : result.grade === 'C' ? 2 : result.grade === 'D' ? 1 : 0,
            passed: result.isPassed,
          })),
        }
      });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load report card', error });
  }
});

router.get('/report-card/students', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId, isActive: true };
    const role = normalizeRole(req.user.role);
    if (['teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
      const scope = await resolveActorScope(req.user);
      if (req.query.classId) {
        if (!scope.assignedClassIds.includes(String(req.query.classId))) {
          return res.status(403).json({ message: 'Access denied. You are not assigned to this class.' });
        }
        query.classId = req.query.classId;
      } else {
        query.classId = { $in: scope.assignedClassIds };
      }
    } else {
      if (req.query.classId) query.classId = req.query.classId;
    }
    if (req.query.sectionId) query.sectionId = req.query.sectionId;
    const students = await Student.find(query)
      .populate('userId', 'name avatar email')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .sort({ rollNumber: 1 });
    res.json({ students });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load report card students', error });
  }
});

router.post('/classes', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const bulkItems = normalizeBulkItems(req.body);
    const payloadItems = bulkItems && bulkItems.length > 0 ? bulkItems : [req.body];
    const createdItems: any[] = [];

    for (const item of payloadItems) {
      const classItem = await ClassModel.create({
        name: item.name,
        grade: item.grade || deriveGrade(item.name),
        shift: item.shift || req.body.shift || 'day',
        classTeacherId: item.classTeacherId || req.body.classTeacherId || undefined,
        academicYear: item.academicYear || req.body.academicYear,
        isActive: item.isActive !== false,
        institutionId: req.user.institutionId,
      });

      classItem.sections = await syncSections(classItem._id, req.user.institutionId, item.sections || req.body.sections || defaultSections());
      await classItem.save();

      const created = await populateClassQuery()
        .where({ _id: classItem._id, institutionId: req.user.institutionId })
        .findOne();
      createdItems.push(created);
    }

    res.status(201).json(bulkItems && bulkItems.length > 0 ? { classItems: createdItems } : { classItem: createdItems[0] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create class', error });
  }
});

router.put('/classes/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const classItem = await ClassModel.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!classItem) return res.status(404).json({ message: 'Class not found' });

    classItem.name = req.body.name;
    classItem.grade = req.body.grade;
    classItem.shift = req.body.shift || 'day';
    classItem.classTeacherId = req.body.classTeacherId || undefined;
    classItem.academicYear = req.body.academicYear;
    classItem.isActive = req.body.isActive !== false;
    classItem.sections = await syncSections(classItem._id, req.user.institutionId, req.body.sections);
    await classItem.save();

    const updated = await populateClassQuery()
      .where({ _id: classItem._id, institutionId: req.user.institutionId })
      .findOne();
    res.json({ classItem: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update class', error });
  }
});

router.delete('/classes/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const classItem = await ClassModel.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!classItem) return res.status(404).json({ message: 'Class not found' });

    const studentCount = await Student.countDocuments({ classId: classItem._id, institutionId: req.user.institutionId });
    if (studentCount > 0) {
      return res.status(409).json({ message: 'Cannot delete a class with enrolled students. Mark it inactive instead.' });
    }

    await Section.deleteMany({ classId: classItem._id, institutionId: req.user.institutionId });
    await classItem.deleteOne();
    res.json({ message: 'Class deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete class', error });
  }
});

router.post('/exams', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const subjectMarks = normalizeSubjectMarks(req.body.subjectMarks);
    const firstSubject = subjectMarks[0];
    const exam = await Exam.create({
      name: req.body.name,
      type: req.body.type,
      classId: req.body.classId,
      sectionId: req.body.sectionId || undefined,
      subjectId: firstSubject?.subjectId || req.body.subjectId || undefined,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      date: firstSubject?.date || req.body.date || req.body.startDate,
      duration: firstSubject?.duration || Number(req.body.duration) || 120,
      totalMarks: firstSubject?.totalMarks || Number(req.body.totalMarks) || 100,
      passingMarks: firstSubject?.passingMarks || Number(req.body.passingMarks) || 33,
      subjectMarks,
      approvalRequired: req.body.approvalRequired === true,
      status: req.body.status || 'scheduled',
      syllabus: req.body.syllabus,
      instructions: req.body.instructions,
      isPublished: req.body.status === 'published' || req.body.isPublished === true,
      createdBy: req.user._id,
      institutionId: req.user.institutionId,
    });

    const created = await populateExamQuery()
      .where({ _id: exam._id, institutionId: req.user.institutionId })
      .findOne();
    res.status(201).json({ exam: created });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create exam', error });
  }
});

router.put('/exams/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const subjectMarks = normalizeSubjectMarks(req.body.subjectMarks);
    const firstSubject = subjectMarks[0];
    exam.name = req.body.name;
    exam.type = req.body.type;
    exam.classId = req.body.classId;
    exam.sectionId = req.body.sectionId || undefined;
    exam.subjectId = firstSubject?.subjectId || req.body.subjectId || undefined;
    exam.startDate = req.body.startDate;
    exam.endDate = req.body.endDate;
    exam.date = firstSubject?.date || req.body.date || req.body.startDate;
    exam.duration = firstSubject?.duration || Number(req.body.duration) || 120;
    exam.totalMarks = firstSubject?.totalMarks || Number(req.body.totalMarks) || 100;
    exam.passingMarks = firstSubject?.passingMarks || Number(req.body.passingMarks) || 33;
    exam.subjectMarks = subjectMarks as any;
    exam.approvalRequired = req.body.approvalRequired === true;
    exam.status = req.body.status || 'scheduled';
    exam.syllabus = req.body.syllabus;
    exam.instructions = req.body.instructions;
    exam.isPublished = req.body.status === 'published' || req.body.isPublished === true;
    await exam.save();

    const updated = await populateExamQuery()
      .where({ _id: exam._id, institutionId: req.user.institutionId })
      .findOne();
    res.json({ exam: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update exam', error });
  }
});

router.delete('/exams/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const exam = await Exam.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!exam) return res.status(404).json({ message: 'Exam not found' });

    const resultCount = await Result.countDocuments({ examId: exam._id, institutionId: req.user.institutionId });
    if (resultCount > 0) {
      return res.status(409).json({ message: 'Cannot delete an exam with submitted results.' });
    }

    await exam.deleteOne();
    res.json({ message: 'Exam deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete exam', error });
  }
});

router.post('/subjects', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const bulkItems = normalizeBulkItems(req.body);
    const payloadItems = bulkItems && bulkItems.length > 0 ? bulkItems : [req.body];
    const createdItems: any[] = [];

    for (const item of payloadItems) {
      const subject = await Subject.create({
        name: item.name,
        code: item.code || deriveCode(item.name),
        type: item.type,
        classId: item.classId,
        teacherId: item.teacherId || undefined,
        description: item.description,
        creditHours: Number(item.creditHours) || 1,
        isActive: item.isActive !== false,
        institutionId: req.user.institutionId,
      });

      await ClassModel.findOneAndUpdate(
        { _id: subject.classId, institutionId: req.user.institutionId },
        { $addToSet: { subjects: subject._id } }
      );
      await syncSubjectTeacher(subject._id, subject.classId, subject.teacherId, req.user.institutionId);

      const created = await populateSubjectQuery()
        .where({ _id: subject._id, institutionId: req.user.institutionId })
        .findOne();
      createdItems.push(created);
    }

    res.status(201).json(bulkItems && bulkItems.length > 0 ? { subjects: createdItems } : { subject: createdItems[0] });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create subject', error });
  }
});

router.put('/subjects/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    const previousClassId = subject.classId;
    subject.name = req.body.name;
    subject.code = req.body.code;
    subject.type = req.body.type;
    subject.classId = req.body.classId;
    subject.teacherId = req.body.teacherId || undefined;
    subject.description = req.body.description;
    subject.creditHours = Number(req.body.creditHours) || 1;
    subject.isActive = req.body.isActive !== false;
    await subject.save();

    if (String(previousClassId) !== String(subject.classId)) {
      await ClassModel.findOneAndUpdate(
        { _id: previousClassId, institutionId: req.user.institutionId },
        { $pull: { subjects: subject._id } }
      );
    }
    await ClassModel.findOneAndUpdate(
      { _id: subject.classId, institutionId: req.user.institutionId },
      { $addToSet: { subjects: subject._id } }
    );
    await syncSubjectTeacher(subject._id, subject.classId, subject.teacherId, req.user.institutionId);

    const updated = await populateSubjectQuery()
      .where({ _id: subject._id, institutionId: req.user.institutionId })
      .findOne();
    res.json({ subject: updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update subject', error });
  }
});

router.delete('/subjects/:id', authenticate, canManageAcademic(), async (req, res) => {
  try {
    const subject = await Subject.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!subject) return res.status(404).json({ message: 'Subject not found' });

    await ClassModel.findOneAndUpdate(
      { _id: subject.classId, institutionId: req.user.institutionId },
      { $pull: { subjects: subject._id } }
    );
    await Teacher.updateMany(
      { institutionId: req.user.institutionId, subjects: subject._id },
      { $pull: { subjects: subject._id } }
    );
    await subject.deleteOne();
    res.json({ message: 'Subject deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete subject', error });
  }
});

// Class Sections CRUD Routes
router.get('/sections', authenticate, allowAcademicOrViewers, async (req: any, res) => {
  try {
    const query: any = { institutionId: req.user.institutionId };
    const role = normalizeRole(req.user.role);

    if (['student', 'parent', 'teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
      const scope = await resolveActorScope(req.user);
      query.classId = { $in: scope.assignedClassIds.map(toObjectId) };
    }

    if (req.query.classId) {
      if (query.classId && !query.classId.$in.map(String).includes(String(req.query.classId))) {
        return res.status(403).json({ message: 'Access denied. You are not assigned to this class.' });
      }
      query.classId = toObjectId(req.query.classId);
    }

    const sections = await Section.find(query)
      .populate('classId', 'name grade academicYear')
      .populate('sectionTeacherId', 'name email phone role')
      .sort({ name: 1 })
      .lean();
    res.json({ sections });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load sections', error });
  }
});

router.get('/sections/:id', authenticate, allowAcademicOrViewers, async (req: any, res) => {
  try {
    const section = await Section.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
      .populate('classId', 'name grade academicYear')
      .populate('sectionTeacherId', 'name email phone role')
      .lean();
    if (!section) return res.status(404).json({ message: 'Section not found' });

    const role = normalizeRole(req.user.role);
    if (['student', 'parent', 'teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
      const scope = await resolveActorScope(req.user);
      if (!scope.assignedClassIds.includes(String(section.classId?._id || section.classId))) {
        return res.status(403).json({ message: 'Access denied.' });
      }
    }
    res.json({ section });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load section', error });
  }
});

router.post('/sections', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (!['head', 'assistant_head'].includes(role) && !(Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const section = await Section.create({
      name: req.body.name,
      classId: req.body.classId,
      sectionTeacherId: req.body.sectionTeacherId || undefined,
      capacity: Number(req.body.capacity) || 30,
      currentStudents: Number(req.body.currentStudents) || 0,
      isActive: req.body.isActive !== false,
      institutionId: req.user.institutionId,
    });
    await ClassModel.findOneAndUpdate(
      { _id: req.body.classId, institutionId: req.user.institutionId },
      { $addToSet: { sections: section._id } }
    );
    res.status(201).json({ section });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create section', error });
  }
});

router.put('/sections/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (!['head', 'assistant_head'].includes(role) && !(Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const section = await Section.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!section) return res.status(404).json({ message: 'Section not found' });

    const previousClassId = section.classId;
    section.name = req.body.name || section.name;
    section.classId = req.body.classId || section.classId;
    section.sectionTeacherId = req.body.sectionTeacherId || section.sectionTeacherId;
    section.capacity = req.body.capacity !== undefined ? Number(req.body.capacity) : section.capacity;
    section.currentStudents = req.body.currentStudents !== undefined ? Number(req.body.currentStudents) : section.currentStudents;
    section.isActive = req.body.isActive !== undefined ? req.body.isActive !== false : section.isActive;
    await section.save();

    if (previousClassId && String(previousClassId) !== String(section.classId)) {
      await ClassModel.findOneAndUpdate(
        { _id: previousClassId, institutionId: req.user.institutionId },
        { $pull: { sections: section._id } }
      );
      await ClassModel.findOneAndUpdate(
        { _id: section.classId, institutionId: req.user.institutionId },
        { $addToSet: { sections: section._id } }
      );
    }
    res.json({ section });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update section', error });
  }
});

router.delete('/sections/:id', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    const role = normalizeRole(req.user.role);
    if (!['head', 'assistant_head'].includes(role) && !(Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:academic'))) {
      return res.status(403).json({ message: 'Access denied.' });
    }
    const section = await Section.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!section) return res.status(404).json({ message: 'Section not found' });

    await ClassModel.findOneAndUpdate(
      { _id: section.classId, institutionId: req.user.institutionId },
      { $pull: { sections: section._id } }
    );
    await section.deleteOne();
    res.json({ message: 'Section deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete section', error });
  }
});

export default router;