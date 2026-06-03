import express from 'express';
import User from '../models/User';
import studentsManageRouter from './studentsManage';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';

const router = express.Router();

const validBloodGroups = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const loginUrl = process.env.FRONTEND_URL || 'http://localhost:3000/login';
const appName = process.env.APP_NAME || 'EASY SCHOOL';
const safeDate = (value: any) => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

router.use(async (req: any, res: any, next) => {
  if (req.method !== 'POST' || req.path !== '/') return next();

  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    const userId = body?.user?._id || body?.student?.userId?._id || body?.student?.userId;
    if (res.statusCode >= 200 && res.statusCode < 300 && userId) {
      const set: any = {};
      const dob = safeDate(req.body?.dateOfBirth);
      if (dob) set.dateOfBirth = dob;
      if (req.body?.fatherName !== undefined) set.fatherName = String(req.body.fatherName || '').trim();
      if (req.body?.motherName !== undefined) set.motherName = String(req.body.motherName || '').trim();
      if (req.body?.address !== undefined) set.address = String(req.body.address || '').trim();
      if (validBloodGroups.has(String(req.body?.bloodGroup || ''))) set.bloodGroup = req.body.bloodGroup;
      if (Object.keys(set).length) {
        User.findByIdAndUpdate(userId, { $set: set }).catch((error) => console.error('Student primary user personal sync failed:', error));
      }
      const phone = String(req.body?.guardianPhone || req.body?.phone || '').trim();
      const c = body?.credentials || {};
      if (phone && c.username) {
        const msg = buildCredentialSmsMessage({
          appName,
          summary: `Student ${body?.user?.name || req.body?.name || ''} account created`.trim(),
          username: c.username,
          password: c.password || c.temporary || 'N/A',
          parentUsername: c.parentUsername,
          parentPassword: c.parentPassword || c.parentTemporary,
          loginUrl,
        }).slice(0, 320);
        sendSMS({ to: phone, message: msg, institutionId: req.user?.institutionId, recipientName: req.body?.guardianName || 'Guardian', recipientPhone: phone, recipientId: body?.parent?._id, recipientType: 'guardian', type: 'credentials', purpose: 'student_parent_login', studentId: body?.student?._id, parentId: body?.parent?._id }).catch((error) => console.error('Student account SMS failed:', error));
      }
    }
    return originalJson(body);
  };
  next();
});

router.use('/', studentsManageRouter);

export default router;
