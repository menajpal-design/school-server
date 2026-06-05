import express from 'express';
import { generateStudentIdCard, generateTeacherIdCard, generateStaffIdCard, bulkGenerateIdCards, downloadIdCard, emailIdCard, verifyByQRCode, renewIdCard, idCardStats, getAllIdCards, getIdCardById, getMyIdCard, getChildIdCard, searchIdCardOwners, generateIdCardRecord, renderCardPdf } from '../controllers/idCard';
import { authenticate } from '../middleware/auth';
import { requireAction, resolveActorScope } from '../services/permissionPolicy';
import IDCard from '../models/IDCard';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';

const router = express.Router();
const leaderRoles = ['head', 'assistant_head', 'admin', 'super_admin'];
const blockedManageRoles = ['student', 'parent', 'teacher', 'subject_teacher', 'class_teacher', 'staff', 'finance_officer', 'librarian'];
const idOf = (value: any) => String(value?._id || value?.id || value || '');
const unique = (values: any[]) => Array.from(new Set(values.map(idOf).filter(Boolean)));

async function myOwnerIds(user: any) {
  const ownerIds = unique([user?._id, user?.id]);
  if (user?.role === 'student') {
    const student = await Student.findOne({ institutionId: user.institutionId, userId: { $in: ownerIds } }).select('_id userId rollNumber admissionNumber registrationNumber idCardNumber').lean();
    if (student) ownerIds.push(...unique([student._id, student.userId]));
  }
  if (['teacher', 'subject_teacher', 'class_teacher'].includes(user?.role)) {
    const teacher = await Teacher.findOne({ institutionId: user.institutionId, userId: { $in: ownerIds } }).select('_id userId').lean();
    if (teacher) ownerIds.push(...unique([teacher._id, teacher.userId]));
  }
  if (['staff', 'finance_officer', 'librarian'].includes(user?.role)) {
    const staff = await Staff.findOne({ institutionId: user.institutionId, userId: { $in: ownerIds } }).select('_id userId').lean();
    if (staff) ownerIds.push(...unique([staff._id, staff.userId]));
  }
  return unique(ownerIds);
}

const idCardManageGuard = (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (leaderRoles.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('manage:idcard'))) return next();
  if (blockedManageRoles.includes(req.user.role)) return res.status(403).json({ message: 'Access denied. ID card management is restricted to school leaders/admins.' });
  return res.status(403).json({ message: 'Access denied. ID card management is restricted.' });
};

const idCardGenerateGuard = (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (leaderRoles.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('generate:idcard'))) return next();
  return res.status(403).json({ message: 'Access denied. ID card generation is restricted to school leaders/admins.' });
};

const idCardReadGuard = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const card = await IDCard.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).lean();
  if (!card) return res.status(404).json({ message: 'Card not found' });
  if (leaderRoles.includes(req.user.role)) return next();
  const ownerIds = await myOwnerIds(req.user);
  if (ownerIds.includes(idOf(card.ownerId))) return next();
  if (req.user.role === 'parent' && card.ownerType === 'student') {
    const scope = await resolveActorScope(req.user);
    const children = await Student.find({ institutionId: req.user.institutionId, _id: { $in: scope.childStudentIds } }).select('_id userId').lean();
    const childOwnerIds = unique(children.flatMap((child: any) => [child._id, child.userId]));
    if (childOwnerIds.includes(idOf(card.ownerId))) return next();
  }
  return res.status(403).json({ message: 'Access denied. You can only view or download your own or linked child ID card.' });
};

const idCardScanGuard = async (req: any, res: any, next: any) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (['staff', 'finance_officer', 'librarian', 'student', 'parent'].includes(req.user.role)) return res.status(403).json({ message: 'Access denied. This role cannot scan ID cards.' });
  if (leaderRoles.includes(req.user.role) || req.user.role === 'class_teacher' || (Array.isArray(req.user.permissions) && (req.user.permissions.includes('scan:idcard') || req.user.permissions.includes('attendance:mark')))) return next();
  return res.status(403).json({ message: 'Access denied. Cannot scan ID cards.' });
};

router.get('/student/:studentId', authenticate, idCardGenerateGuard, generateStudentIdCard);
router.get('/teacher/:teacherId', authenticate, idCardGenerateGuard, generateTeacherIdCard);
router.get('/staff/:staffId', authenticate, idCardGenerateGuard, generateStaffIdCard);
router.get('/me/card', authenticate, getMyIdCard);
router.get('/child/:studentId/card', authenticate, getChildIdCard);
router.get('/owners/search', authenticate, idCardGenerateGuard, searchIdCardOwners);
router.post('/', authenticate, idCardGenerateGuard, generateIdCardRecord);
router.post('/generate', authenticate, idCardGenerateGuard, generateIdCardRecord);
router.post('/bulk', authenticate, idCardGenerateGuard, bulkGenerateIdCards);
router.post('/render-pdf', authenticate, idCardReadGuard, renderCardPdf);
router.get('/:id/download', authenticate, idCardReadGuard, downloadIdCard);
router.post('/:id/email', authenticate, idCardManageGuard, emailIdCard);
router.post('/verify', authenticate, idCardScanGuard, verifyByQRCode);
router.post('/:id/renew', authenticate, idCardManageGuard, renewIdCard);
router.get('/reports/stats', authenticate, idCardManageGuard, idCardStats);
router.get('/', authenticate, idCardManageGuard, getAllIdCards);
router.get('/:id', authenticate, idCardReadGuard, getIdCardById);

export default router;
