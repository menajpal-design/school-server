import express from 'express';
import Institution from '../models/Institution';
import ClassModel from '../models/Class';
import Exam from '../models/Exam';
import Result from '../models/Result';
import Student from '../models/Student';

const router = express.Router();

const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'mail', 'support']);
const MAIN_DOMAIN = (process.env.MAIN_DOMAIN || 'easyschool.live').toLowerCase();

const clean = (value: any) => String(value || '').trim();
const oid = (value: any) => String(value?._id || value || '');
const textRegex = (value: string) => new RegExp(clean(value).replace(/[^a-zA-Z0-9 ]/g, ''), 'i');
const getExamYear = (exam: any, fallback?: any) => { const explicit = Number(fallback || exam?.year || exam?.academicYear); if (explicit && explicit > 1900) return explicit; const date = exam?.startDate || exam?.date || exam?.endDate; if (date) { const parsed = new Date(date); if (!Number.isNaN(parsed.getTime())) return parsed.getFullYear(); } return undefined; };

const hostFromRequest = (req: any) => clean(req.query.domain || req.headers['x-client-domain'] || req.headers.host || req.hostname)
  .replace(/^https?:\/\//i, '')
  .replace(/:\d+$/, '')
  .replace(/^www\./i, '')
  .toLowerCase();

const subdomainFromRequest = (req: any) => {
  const explicit = clean(req.query.subdomain || req.headers['x-client-subdomain']).toLowerCase();
  if (explicit && !RESERVED_SUBDOMAINS.has(explicit)) return explicit;
  const host = hostFromRequest(req);
  if (!host || host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}` || host === 'localhost' || host === '127.0.0.1') return '';
  if (host.endsWith(`.${MAIN_DOMAIN}`)) {
    const sub = host.slice(0, -1 * (`.${MAIN_DOMAIN}`).length).split('.').pop() || '';
    return RESERVED_SUBDOMAINS.has(sub) ? '' : sub;
  }
  return '';
};

const publicSchoolSelect = 'name type eiin address website domains subdomain logo logoUrl image imageUrl';

const resolveInstitution = async (req: any) => {
  const subdomain = subdomainFromRequest(req);
  if (subdomain) return Institution.findOne({ subdomain, isActive: true }).select(publicSchoolSelect).lean();

  const institutionId = clean(req.query.institutionId || req.query.schoolId);
  if (institutionId) return Institution.findOne({ _id: institutionId, isActive: true }).select(publicSchoolSelect).lean();

  const host = hostFromRequest(req);
  if (host && host !== MAIN_DOMAIN && host !== `www.${MAIN_DOMAIN}` && host !== 'localhost' && host !== '127.0.0.1') {
    return Institution.findOne({ isActive: true, $or: [{ website: textRegex(host) }, { domains: host }, { domains: `www.${host}` }] }).select(publicSchoolSelect).lean();
  }

  return null;
};

const loadPublicOptions = async (institutionId: any, classId?: any, year?: any) => {
  const resultBaseQuery: any = { institutionId, workflowStatus: 'published' };
  if (year) resultBaseQuery.year = Number(year);
  const [publishedExamIds, publishedStudentIds, years] = await Promise.all([
    Result.distinct('examId', resultBaseQuery),
    Result.distinct('studentId', resultBaseQuery),
    Result.distinct('year', { institutionId, workflowStatus: 'published' }),
  ]);
  const classIdsWithPublishedResults = publishedStudentIds.length ? await Student.distinct('classId', { institutionId, isActive: true, _id: { $in: publishedStudentIds } }) : [];
  const classQuery: any = { institutionId, isActive: true };
  if (classIdsWithPublishedResults.length) classQuery._id = { $in: classIdsWithPublishedResults };
  const examQuery: any = { institutionId, _id: { $in: publishedExamIds } };
  if (classId) examQuery.classId = classId;
  const [classes, exams] = await Promise.all([
    ClassModel.find(classQuery).select('name grade academicYear sections').populate('sections', 'name isActive').sort({ grade: 1, name: 1 }).lean(),
    Exam.find(examQuery).select('name type classId startDate endDate subjectMarks totalMarks passingMarks').sort({ startDate: -1, createdAt: -1 }).lean(),
  ]);
  return { classes, exams, years: years.filter(Boolean).sort((a: any, b: any) => Number(b) - Number(a)) };
};

router.get('/schools', async (req, res) => {
  try {
    const subdomain = subdomainFromRequest(req);
    if (subdomain) {
      const school = await Institution.findOne({ subdomain, isActive: true }).select(publicSchoolSelect).lean();
      return res.json({ schools: school ? [school] : [], locked: Boolean(school), subdomain });
    }
    const resolved = await resolveInstitution(req);
    if (resolved) return res.json({ schools: [resolved], locked: true });
    const search = clean(req.query.search);
    const query: any = { isActive: true };
    if (search) query.$or = [{ name: textRegex(search) }, { eiin: textRegex(search) }, { address: textRegex(search) }];
    const schools = await Institution.find(query).select(publicSchoolSelect).sort({ name: 1 }).limit(100).lean();
    res.json({ schools, locked: false });
  } catch (error) { res.status(500).json({ message: 'Failed to load public schools', error }); }
});

router.get('/options', async (req, res) => {
  try {
    const institution = await resolveInstitution(req);
    if (!institution) return res.status(404).json({ message: 'School not found' });
    const { classes, exams, years } = await loadPublicOptions(institution._id, req.query.classId, req.query.year);
    res.json({ institution, school: institution, classes, exams, years, appControlSettings: {} });
  } catch (error) { res.status(500).json({ message: 'Failed to load result options', error }); }
});

router.get('/', async (req, res) => {
  try {
    const institution = await resolveInstitution(req);
    if (!institution) return res.status(404).json({ message: 'School not found' });
    const classId = clean(req.query.classId);
    const sectionId = clean(req.query.sectionId);
    const examId = clean(req.query.examId);
    const year = clean(req.query.year);
    const rollNumber = clean(req.query.rollNumber || req.query.roll);
    const regNumber = clean(req.query.regNumber || req.query.registrationNo || req.query.registrationNumber);
    const studentName = clean(req.query.name || req.query.studentName);
    if (!classId) return res.status(400).json({ message: 'Class Name is required' });
    if (!year) return res.status(400).json({ message: 'Year is required' });
    if (!examId) return res.status(400).json({ message: 'Exam Name is required' });
    if (!rollNumber && !regNumber && !studentName) return res.status(400).json({ message: 'Provide Roll, Registration No or Student Name' });
    const studentQuery: any = { institutionId: institution._id, isActive: true, classId };
    if (sectionId) studentQuery.sectionId = sectionId;
    if (rollNumber) studentQuery.rollNumber = rollNumber;
    let candidates: any[] = await Student.find(studentQuery).populate('userId', 'name email phone gender fatherName motherName dateOfBirth').populate('classId', 'name grade academicYear').populate('sectionId', 'name').sort({ rollNumber: 1 }).limit(50).lean();
    if (regNumber) {
      const regLower = regNumber.toLowerCase();
      candidates = candidates.filter((student: any) => String(student.registrationNo || student.registrationNumber || student.idCardNumber || student._id || '').toLowerCase() === regLower);
    }
    if (studentName) {
      const nameLower = studentName.toLowerCase();
      candidates = candidates.filter((student: any) => String(student.userId?.name || student.guardianName || '').toLowerCase().includes(nameLower));
    }
    const student: any = candidates[0];
    if (!student) return res.status(404).json({ message: 'No student found for this school, class, section and search details' });
    const resultQuery: any = { institutionId: institution._id, studentId: student._id, examId, workflowStatus: 'published' };
    if (year) resultQuery.year = Number(year);
    const results = await Result.find(resultQuery).populate({ path: 'examId', select: 'name type totalMarks passingMarks subjectMarks classId startDate endDate', populate: { path: 'subjectMarks.subjectId', select: 'name code' } }).populate('subjectId', 'name code').sort({ createdAt: 1 }).lean();
    if (!results.length) return res.status(404).json({ message: 'Published result not found for this Year and Exam Name' });
    const gradePoints: Record<string, number> = { 'A+': 5, A: 4, 'A-': 3.5, B: 3, C: 2, D: 1, F: 0 };
    const formatDate = (value: any) => { if (!value) return ''; const d = new Date(value); if (Number.isNaN(d.getTime())) return ''; return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`; };
    const firstExam: any = results[0]?.examId;
    let totalObtained = 0; let totalMarks = 0; let totalPoints = 0; let subjectCount = 0; let hasFailed = false;
    const rows = results.map((result: any) => {
      const setup = (firstExam?.subjectMarks || []).find((item: any) => oid(item.subjectId) === oid(result.subjectId));
      const rowTotal = Number(setup?.totalMarks || firstExam?.totalMarks || 100);
      const rowPass = Number(setup?.passingMarks || firstExam?.passingMarks || 33);
      const marks = Number(result.marksObtained || 0);
      const grade = String(result.grade || '').toUpperCase();
      totalObtained += marks; totalMarks += rowTotal;
      if (grade) { totalPoints += gradePoints[grade] ?? 0; subjectCount += 1; }
      if (grade === 'F' || result.isPassed === false || marks < rowPass) hasFailed = true;
      return { examName: firstExam?.name || 'Examination', examType: firstExam?.type || '', year: result.year || Number(year) || getExamYear(firstExam), subjectName: result.subjectId?.name || setup?.subjectId?.name || 'Subject', subjectCode: result.subjectId?.code || setup?.subjectId?.code || '', fullMarks: rowTotal, passingMarks: rowPass, marksObtained: result.marksObtained, grade: result.grade || '', gradePoint: gradePoints[grade] ?? '', isPassed: !(grade === 'F' || result.isPassed === false || marks < rowPass), remarks: result.remarks || '', status: result.workflowStatus };
    });
    const percentage = totalMarks ? Math.round((totalObtained / totalMarks) * 100) : 0;
    const gpaValue = subjectCount ? Number((totalPoints / subjectCount).toFixed(2)) : 0;
    const gpaText = hasFailed ? 'FAILED' : `GPA=${gpaValue.toFixed(2)}`;
    const examYear = Number(year) || getExamYear(firstExam) || '';
    const examPayload = { examId, examName: firstExam?.name || 'Examination', examYear, summary: { totalObtained, totalMarks, percentage, passed: !hasFailed, gpa: gpaText, gradePointAverage: gpaValue, examName: firstExam?.name || 'Examination', examYear, className: student.classId?.name || '', sectionName: student.sectionId?.name || '', publishedAt: results.find((r: any) => r.publishedAt)?.publishedAt || results[0]?.updatedAt }, results: rows };
    res.json({ institution: { id: institution._id, name: (institution as any).name, eiin: (institution as any).eiin, address: (institution as any).address, logo: (institution as any).logo || (institution as any).logoUrl || (institution as any).image || (institution as any).imageUrl || '' }, student: { id: student._id, name: student.userId?.name || student.guardianName || 'Student', rollNumber: student.rollNumber, registrationNo: student.registrationNo || student.registrationNumber || student.idCardNumber || '', className: student.classId?.name || '', sectionName: student.sectionId?.name || '', fatherName: student.fatherName || student.userId?.fatherName || '', motherName: student.motherName || student.userId?.motherName || '', dateOfBirth: formatDate(student.dateOfBirth || student.userId?.dateOfBirth), gender: student.userId?.gender || '', bloodGroup: student.bloodGroup || '', session: student.classId?.academicYear ? String(student.classId.academicYear) : String(examYear || ''), group: 'GENERAL', admissionDate: student.admissionDate }, exams: [examPayload], summary: examPayload.summary, results: rows });
  } catch (error) { res.status(500).json({ message: 'Failed to load public result', error }); }
});

export default router;
