import express from 'express';
import mongoose from 'mongoose';
import Attendance from '../models/Attendance';
import Salary from '../models/Salary';
import Staff from '../models/Staff';
import Teacher from '../models/Teacher';
import User from '../models/User';
import SiteSetting from '../models/SiteSetting';
import { authenticate, canManageFinance } from '../middleware/auth';
import { writeAuditLog } from '../services/auditService';
import { runWithTenantStorage } from '../config/tenantStorage';

const router = express.Router();
const primaryDb = <T>(fn: () => Promise<T>) => runWithTenantStorage(null, fn);
const connections = new Map<string, Promise<mongoose.Connection>>();

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const getMonthIndex = (month: string) => { if (/^\d{1,2}$/.test(month)) return Math.max(0, Math.min(11, Number(month) - 1)); const index = monthNames.findIndex((item) => item.toLowerCase() === String(month || '').toLowerCase()); return index >= 0 ? index : new Date().getMonth(); };
const getMonthRange = (month: string, year: number) => { const monthIndex = getMonthIndex(month); return { start: new Date(year, monthIndex, 1), end: new Date(year, monthIndex + 1, 1), daysInMonth: new Date(year, monthIndex + 1, 0).getDate(), monthName: monthNames[monthIndex] }; };
const stripFallbackPrefix = (value: any) => String(value || '').replace(/^user-/, '');
const isObjectId = (value: any) => mongoose.Types.ObjectId.isValid(String(value || ''));
const mongoItems = (config: any = {}) => { const existing = Array.isArray(config.mongodbUris) ? config.mongodbUris : []; const items = existing.map((x: any, i: number) => ({ id: x.id || `mongo-${i + 1}`, uri: x.uri || x.mongodbUrl || '', isActive: x.isActive === true })).filter((x: any) => x.uri); if (config.mongodbUrl && !items.some((x: any) => x.uri === config.mongodbUrl)) items.push({ id: `mongo-${items.length + 1}`, uri: config.mongodbUrl, isActive: true }); if (items.length && !items.some((x: any) => x.isActive)) items[items.length - 1].isActive = true; return items; };
async function activeUri(req: any) { const setting: any = await primaryDb(async () => (await SiteSetting.findOne({ key: 'site_config' }).lean())?.value || {}); const items = mongoItems(setting); const active = items.find((x: any) => x.isActive) || items[items.length - 1]; const uri = String(active?.uri || setting.mongodbUrl || req.user?.institution?.settings?.mongodbUri || '').trim(); if (!uri) throw Object.assign(new Error('School MongoDB URI missing. Settings-এ active MongoDB URI save করুন।'), { statusCode: 428 }); return uri; }
async function activeConnection(req: any) { const uri = await activeUri(req); if (!connections.has(uri)) connections.set(uri, mongoose.createConnection(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 15000, connectTimeoutMS: 15000, socketTimeoutMS: 30000, retryWrites: true }).asPromise()); try { const c = await connections.get(uri)!; await c.db.admin().ping(); return c; } catch (error: any) { connections.delete(uri); throw Object.assign(new Error(`Active Settings MongoDB connection failed for Payroll: ${error?.message || 'unknown error'}`), { statusCode: 503 }); } }
async function models(req: any) { const c = await activeConnection(req); const model = (name: string, base: any) => c.models[name] || c.model(name, base.schema, base.collection?.name || name); return { Attendance: model('Attendance', Attendance), Salary: model('Salary', Salary), Staff: model('Staff', Staff), Teacher: model('Teacher', Teacher) }; }
const getEmployeeModel = (M: any, employeeType: string) => employeeType === 'staff' ? M.Staff : M.Teacher;
const userRoles = (employeeType: string) => employeeType === 'staff' ? ['staff', 'finance_officer', 'librarian', 'accountant'] : ['teacher', 'subject_teacher', 'class_teacher', 'assistant_head', 'head'];
const userSelect = 'name email phone role salary employeeId designation department createdAt';

const findEmployee = async (M: any, institutionId: any, employeeId: any, employeeType: string) => {
  const EmployeeModel: any = getEmployeeModel(M, employeeType);
  const rawId = String(employeeId || '');
  const userId = stripFallbackPrefix(rawId);
  let employee: any = null;
  if (rawId && !rawId.startsWith('user-') && isObjectId(rawId)) employee = await EmployeeModel.findOne({ _id: rawId, institutionId }).lean();
  if (!employee && isObjectId(userId)) employee = await EmployeeModel.findOne({ userId, institutionId }).lean();
  let user: any = null;
  const lookupUserId = String(employee?.userId?._id || employee?.userId || userId || '');
  if (isObjectId(lookupUserId)) user = await primaryDb(() => User.findOne({ _id: lookupUserId, institutionId, role: { $in: userRoles(employeeType) }, isActive: { $ne: false } }).select(userSelect).lean());
  if (employee) return { ...employee, userId: user || employee.userId, salary: Number(employee.salary ?? user?.salary ?? 0) };
  if (!user && isObjectId(userId)) user = await primaryDb(() => User.findOne({ _id: userId, institutionId, role: { $in: userRoles(employeeType) }, isActive: { $ne: false } }).select(userSelect).lean());
  if (!user) return null;
  return { _id: rawId.startsWith('user-') ? rawId : `user-${user._id}`, userId: user, employeeId: user.employeeId || (employeeType === 'staff' ? `S-${String(user._id).slice(-4)}` : `T-${String(user._id).slice(-4)}`), designation: user.designation || (employeeType === 'staff' ? 'Staff' : user.role === 'class_teacher' ? 'Class Teacher' : user.role === 'subject_teacher' ? 'Subject Teacher' : 'Teacher'), department: user.department || 'General', salary: Number(user.salary || 0), joiningDate: user.createdAt || new Date(), institutionId, fallbackFromUsers: true };
};

const buildAttendanceSalary = async ({ M, institutionId, employeeId, employeeType, month, year, basicSalary, bonus = 0, manualDeduction = 0 }: any) => {
  const employee: any = await findEmployee(M, institutionId, employeeId, employeeType);
  if (!employee) throw Object.assign(new Error('Employee not found'), { statusCode: 404 });
  const salaryBase = Number(basicSalary ?? employee.salary ?? employee.userId?.salary ?? 0);
  const { start, end, daysInMonth, monthName } = getMonthRange(month, Number(year));
  const userId = employee.userId?._id || employee.userId || stripFallbackPrefix(employeeId);
  const attendance = await M.Attendance.find({ institutionId, userId, userType: employeeType, date: { $gte: start, $lt: end } }).lean();
  const presentDays = attendance.filter((item: any) => item.status === 'present').length;
  const absentDays = attendance.filter((item: any) => item.status === 'absent').length;
  const lateDays = attendance.filter((item: any) => item.status === 'late').length;
  const leaveDays = attendance.filter((item: any) => item.status === 'leave').length;
  const workingDays = Number(daysInMonth || 30);
  const unpaidAbsentDays = absentDays;
  const perDaySalary = workingDays > 0 ? salaryBase / workingDays : 0;
  const attendanceDeduction = Math.round(perDaySalary * unpaidAbsentDays);
  const grossSalary = salaryBase + Number(bonus || 0);
  const totalDeduction = Number(manualDeduction || 0) + attendanceDeduction;
  const netSalary = Math.max(grossSalary - totalDeduction, 0);
  return { employee, employeeId: employee._id, employeeType, month: monthName, year: Number(year), basicSalary: salaryBase, bonus: Number(bonus || 0), manualDeduction: Number(manualDeduction || 0), grossSalary, netSalary, attendanceSummary: { workingDays, presentDays, absentDays, lateDays, leaveDays, unpaidAbsentDays, perDaySalary: Math.round(perDaySalary), attendanceDeduction }, attendance };
};

router.use(authenticate);
router.use(canManageFinance());

router.get('/salary-attendance/preview', async (req: any, res) => {
  try { const M = await models(req); const payload = await buildAttendanceSalary({ M, institutionId: req.user.institutionId, employeeId: req.query.employeeId, employeeType: req.query.employeeType, month: String(req.query.month || monthNames[new Date().getMonth()]), year: Number(req.query.year || new Date().getFullYear()), basicSalary: req.query.basicSalary, bonus: req.query.bonus, manualDeduction: req.query.deduction }); res.json({ ...payload, message: 'Attendance-linked salary preview generated.', debug: { source: 'active-school-db' } }); }
  catch (error: any) { res.status(error?.statusCode || 500).json({ message: error.message || 'Failed to generate salary attendance preview', error }); }
});

router.post('/salary-attendance/process', async (req: any, res) => {
  try {
    const M = await models(req);
    const payload = await buildAttendanceSalary({ M, institutionId: req.user.institutionId, employeeId: req.body.employeeId, employeeType: req.body.employeeType, month: req.body.month || monthNames[new Date().getMonth()], year: Number(req.body.year || new Date().getFullYear()), basicSalary: req.body.basicSalary, bonus: req.body.bonus, manualDeduction: req.body.deduction });
    const salary = await M.Salary.findOneAndUpdate({ institutionId: req.user.institutionId, employeeId: payload.employeeId, employeeType: payload.employeeType, month: payload.month, year: payload.year }, { employeeId: payload.employeeId, employeeType: payload.employeeType, basicSalary: payload.basicSalary, allowances: { other: payload.bonus }, deductions: { attendance: payload.attendanceSummary.attendanceDeduction, other: payload.manualDeduction }, attendanceSummary: payload.attendanceSummary, grossSalary: payload.grossSalary, netSalary: payload.netSalary, month: payload.month, year: payload.year, paymentDate: req.body.paymentDate || new Date(), status: req.body.status || 'paid', paymentMethod: req.body.paymentMethod || 'bank_transfer', transactionId: req.body.transactionId, processedBy: req.user._id, institutionId: req.user.institutionId }, { upsert: true, new: true, setDefaultsOnInsert: true });
    await writeAuditLog(req, 'process', 'attendance-linked-salary', salary._id, salary);
    res.status(201).json({ salary, preview: payload, message: 'Attendance-linked salary processed.', debug: { source: 'active-school-db' } });
  } catch (error: any) { res.status(error?.statusCode || 500).json({ message: error.message || 'Failed to process attendance-linked salary', error }); }
});

export default router;
