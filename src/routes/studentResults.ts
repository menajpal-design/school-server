import express from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import Result from '../models/Result';
import Student from '../models/Student';
import Institution from '../models/Institution';
import ClassModel from '../models/Class';
import Section from '../models/Section';
import Subject from '../models/Subject';
import Exam from '../models/Exam';
import SiteSetting from '../models/SiteSetting';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const resultConnections = new Map<string, Promise<mongoose.Connection>>();

const gradePoint = (grade?: string) => {
  const g = String(grade || '').trim().toUpperCase();
  if (g === 'A+') return 5;
  if (g === 'A') return 4;
  if (g === 'A-') return 3.5;
  if (g === 'B') return 3;
  if (g === 'C') return 2;
  if (g === 'D') return 1;
  return 0;
};

const totalMarksFor = (result: any) => {
  const setup = result.examId?.subjectMarks?.find((item: any) => String(item.subjectId?._id || item.subjectId) === String(result.subjectId?._id || result.subjectId));
  return Number(setup?.totalMarks || result.examId?.totalMarks || 100);
};

const normalizeMongoItems = (config: any = {}) => {
  const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : [];
  const items = existing.map((item: any, index: number) => ({ id: item.id || `mongo-${index + 1}`, uri: item.uri || item.mongodbUrl || '', isActive: item.isActive === true })).filter((item: any) => item.uri);
  if (config.mongodbUrl && !items.some((item: any) => item.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true });
  if (items.length && !items.some((item: any) => item.isActive)) items[items.length - 1].isActive = true;
  return items;
};

async function activeMongoUri(req: any) {
  const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {});
  const items = normalizeMongoItems(setting);
  const activeMongo = items.find((item: any) => item.isActive) || items[items.length - 1];
  return String(activeMongo?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim();
}

async function resultConnection(req: any) {
  const uri = await activeMongoUri(req);
  if (!uri) return null;
  if (!resultConnections.has(uri)) resultConnections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise());
  try {
    const connection = await resultConnections.get(uri)!;
    await connection.db.admin().ping();
    return connection;
  } catch (error) {
    resultConnections.delete(uri);
    console.warn('Personal result active school MongoDB failed; falling back:', (error as any)?.message || error);
    return null;
  }
}

async function models(req: any) {
  const connection = await resultConnection(req);
  if (!connection) return { Student, Result, Class: ClassModel, Section, Subject, Exam };
  const model = (name: string, base: any) => connection.models[name] || connection.model(name, base.schema, base.collection?.name || name);
  return { Student: model('Student', Student), Result: model('Result', Result), Class: model('Class', ClassModel), Section: model('Section', Section), Subject: model('Subject', Subject), Exam: model('Exam', Exam) };
}

const shapeRow = (result: any) => {
  const totalMarks = totalMarksFor(result);
  const marks = Number(result.marksObtained || 0);
  const percentage = totalMarks ? Math.round((marks / totalMarks) * 100) : 0;
  return {
    _id: result._id,
    examId: result.examId?._id || result.examId,
    examName: result.examId?.name || 'Exam',
    examType: result.examId?.type || '',
    subjectId: result.subjectId?._id || result.subjectId,
    subjectName: result.subjectId?.name || 'Subject',
    subjectCode: result.subjectId?.code || '',
    marksObtained: result.marksObtained,
    totalMarks,
    percentage,
    grade: result.grade || '',
    gradePoint: gradePoint(result.grade),
    isPassed: result.isPassed !== false,
    remarks: result.remarks || '',
    status: result.workflowStatus,
    publishedAt: result.publishedAt || result.createdAt,
  };
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    if (!['student', 'parent'].includes(req.user.role)) return res.status(403).json({ message: 'Only students and parents can access personal results from this endpoint.' });
    const institutionId = req.user.institutionId;
    const M = await models(req);
    const studentQuery: any = { institutionId, isActive: true };
    if (req.user.role === 'student') studentQuery.userId = req.user._id;
    else if (req.query.studentId) { studentQuery._id = req.query.studentId; studentQuery.parentId = req.user._id; }
    else studentQuery.parentId = req.user._id;

    let student = await (M.Student as any).findOne(studentQuery).populate('userId', 'name email phone avatar gender').populate('classId', 'name grade academicYear').populate('sectionId', 'name').lean();
    if (!student && req.user.role === 'student') student = await (M.Student as any).findOne({ institutionId, userId: req.user._id }).populate('userId', 'name email phone avatar gender').populate('classId', 'name grade academicYear').populate('sectionId', 'name').lean();
    if (!student) return res.status(404).json({ message: 'Student profile/result not found for current user.' });

    const baseQuery: any = { institutionId, studentId: student._id, workflowStatus: { $in: ['approved', 'published'] } };
    const allResults = await (M.Result as any).find(baseQuery).populate('examId', 'name type totalMarks passingMarks subjectMarks startDate endDate').populate('subjectId', 'name code').sort({ publishedAt: -1, createdAt: -1 }).lean();
    const allRows = allResults.map(shapeRow);

    const filteredRows = allRows.filter((row: any) => {
      if (req.query.examId && String(row.examId) !== String(req.query.examId)) return false;
      if (req.query.subjectId && String(row.subjectId) !== String(req.query.subjectId)) return false;
      return true;
    });

    const institution = await primaryDb(() => Institution.findById(institutionId).select('name eiin address phone website subdomain').lean());
    const totalObtained = filteredRows.reduce((sum: number, item: any) => sum + Number(item.marksObtained || 0), 0);
    const grandTotal = filteredRows.reduce((sum: number, item: any) => sum + Number(item.totalMarks || 0), 0);
    const failed = filteredRows.some((item: any) => item.isPassed === false || String(item.grade).toUpperCase() === 'F');
    const gpa = filteredRows.length ? (failed ? 0 : Number((filteredRows.reduce((sum: number, item: any) => sum + Number(item.gradePoint || 0), 0) / filteredRows.length).toFixed(2))) : 0;

    res.json({
      institution,
      student: { _id: student._id, name: (student.userId as any)?.name || student.guardianName || 'Student', rollNumber: student.rollNumber, className: (student.classId as any)?.name || '', sectionName: (student.sectionId as any)?.name || '', academicYear: (student.classId as any)?.academicYear || '' },
      filters: {
        exams: Array.from(new Map(allRows.map((r: any) => [String(r.examId), { _id: r.examId, name: r.examName, type: r.examType }])).values()),
        subjects: Array.from(new Map(allRows.map((r: any) => [String(r.subjectId), { _id: r.subjectId, name: r.subjectName, code: r.subjectCode }])).values()),
      },
      summary: { totalSubjects: filteredRows.length, totalObtained, totalMarks: grandTotal, percentage: grandTotal ? Math.round((totalObtained / grandTotal) * 100) : 0, gpa, passed: filteredRows.length ? !failed : false },
      results: filteredRows,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load personal results', error });
  }
});

export default router;
