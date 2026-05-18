import express from 'express';
import Attendance from '../models/Attendance';
import Salary from '../models/Salary';
import Staff from '../models/Staff';
import Teacher from '../models/Teacher';
import { authenticate, canManageFinance } from '../middleware/auth';
import { writeAuditLog } from '../services/auditService';

const router = express.Router();

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const getMonthIndex = (month: string) => {
  if (/^\d{1,2}$/.test(month)) return Math.max(0, Math.min(11, Number(month) - 1));
  const index = monthNames.findIndex((item) => item.toLowerCase() === String(month || '').toLowerCase());
  return index >= 0 ? index : new Date().getMonth();
};

const getMonthRange = (month: string, year: number) => {
  const monthIndex = getMonthIndex(month);
  return {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 1),
    daysInMonth: new Date(year, monthIndex + 1, 0).getDate(),
    monthName: monthNames[monthIndex],
  };
};

const getEmployeeModel = (employeeType: string) => employeeType === 'staff' ? Staff : Teacher;

const buildAttendanceSalary = async ({ institutionId, employeeId, employeeType, month, year, basicSalary, bonus = 0, manualDeduction = 0 }: any) => {
  const EmployeeModel: any = getEmployeeModel(employeeType);
  const employee = await EmployeeModel.findOne({ _id: employeeId, institutionId }).populate('userId', 'name email phone').lean();
  if (!employee) throw new Error('Employee not found');

  const salaryBase = Number(basicSalary ?? employee.salary ?? 0);
  const { start, end, daysInMonth, monthName } = getMonthRange(month, Number(year));
  const userId = (employee as any).userId?._id || (employee as any).userId;

  const attendance = await Attendance.find({
    institutionId,
    userId,
    userType: employeeType,
    date: { $gte: start, $lt: end },
  }).lean();

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

  return {
    employee,
    employeeId,
    employeeType,
    month: monthName,
    year: Number(year),
    basicSalary: salaryBase,
    bonus: Number(bonus || 0),
    manualDeduction: Number(manualDeduction || 0),
    grossSalary,
    netSalary,
    attendanceSummary: {
      workingDays,
      presentDays,
      absentDays,
      lateDays,
      leaveDays,
      unpaidAbsentDays,
      perDaySalary: Math.round(perDaySalary),
      attendanceDeduction,
    },
    attendance,
  };
};

router.use(authenticate);
router.use(canManageFinance());

router.get('/salary-attendance/preview', async (req, res) => {
  try {
    const payload = await buildAttendanceSalary({
      institutionId: req.user.institutionId,
      employeeId: req.query.employeeId,
      employeeType: req.query.employeeType,
      month: String(req.query.month || monthNames[new Date().getMonth()]),
      year: Number(req.query.year || new Date().getFullYear()),
      basicSalary: req.query.basicSalary,
      bonus: req.query.bonus,
      manualDeduction: req.query.deduction,
    });

    res.json({ ...payload, message: 'Attendance-linked salary preview generated.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to generate salary attendance preview', error });
  }
});

router.post('/salary-attendance/process', async (req, res) => {
  try {
    const payload = await buildAttendanceSalary({
      institutionId: req.user.institutionId,
      employeeId: req.body.employeeId,
      employeeType: req.body.employeeType,
      month: req.body.month || monthNames[new Date().getMonth()],
      year: Number(req.body.year || new Date().getFullYear()),
      basicSalary: req.body.basicSalary,
      bonus: req.body.bonus,
      manualDeduction: req.body.deduction,
    });

    const salary = await Salary.findOneAndUpdate(
      {
        institutionId: req.user.institutionId,
        employeeId: payload.employeeId,
        employeeType: payload.employeeType,
        month: payload.month,
        year: payload.year,
      },
      {
        employeeId: payload.employeeId,
        employeeType: payload.employeeType,
        basicSalary: payload.basicSalary,
        allowances: { other: payload.bonus },
        deductions: {
          attendance: payload.attendanceSummary.attendanceDeduction,
          other: payload.manualDeduction,
        },
        attendanceSummary: payload.attendanceSummary,
        grossSalary: payload.grossSalary,
        netSalary: payload.netSalary,
        month: payload.month,
        year: payload.year,
        paymentDate: req.body.paymentDate || new Date(),
        status: req.body.status || 'paid',
        paymentMethod: req.body.paymentMethod || 'bank_transfer',
        transactionId: req.body.transactionId,
        processedBy: req.user._id,
        institutionId: req.user.institutionId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await writeAuditLog(req, 'process', 'attendance-linked-salary', salary._id, salary);
    res.status(201).json({ salary, preview: payload, message: 'Attendance-linked salary processed.' });
  } catch (error: any) {
    res.status(500).json({ message: error.message || 'Failed to process attendance-linked salary', error });
  }
});

export default router;
