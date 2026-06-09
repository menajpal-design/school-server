import express from 'express';
import { generateStudentIdCard, generateTeacherIdCard, generateStaffIdCard, bulkGenerateIdCards, downloadIdCard, emailIdCard, verifyByQRCode, renewIdCard, idCardStats, getAllIdCards, getIdCardById, getMyIdCard, getChildIdCard, searchIdCardOwners, generateIdCardRecord, renderCardPdf } from '../controllers/idCard';
import { renderServerAdmitCardPdf } from '../controllers/admitCardPdf';
import { authenticate } from '../middleware/auth';
import { resolveActorScope } from '../services/permissionPolicy';
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

const makeCardNumber = async (ownerType: string, institutionId: any) => {
  const year = new Date().getFullYear();
  const prefix = ownerType === 'student' ? 'STU' : ownerType === 'teacher' ? 'TCH' : ownerType === 'staff' ? 'STF' : 'CARD';
  const count = await IDCard.countDocuments({ institutionId, ownerType, issuedAt: { $gte: new Date(`${year}-01-01T00:00:00Z`), $lte: new Date(`${year}-12-31T23:59:59Z`) } });
  return `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
};

const safeMyIdCard = async (req: any, res: any) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: 'Authentication required.' });
    if (user.role === 'parent') return getMyIdCard(req, res);
    if (user.role !== 'student') return getMyIdCard(req, res);

    const userIds = unique([user._id, user.id]);
    let student: any = await Student.findOne({ institutionId: user.institutionId, userId: { $in: userIds } }).populate('userId').populate('classId').populate('sectionId').populate('institutionId');
    if (!student && user.username) {
      student = await Student.findOne({ institutionId: user.institutionId, $or: [{ rollNumber: user.username }, { idCardNumber: user.username }, { admissionNumber: user.username }, { registrationNumber: user.username }] }).populate('userId').populate('classId').populate('sectionId').populate('institutionId');
    }

    if (!student) {
      return res.json({
        card: null,
        student: null,
        generated: false,
        profileMissing: true,
        message: 'Student profile is not linked with this login yet. Please contact school office to link this user with a student record.',
      });
    }

    const ownerIds = unique([user._id, user.id, student._id, student.userId?._id, student.userId]);
    let card: any = await IDCard.findOne({ institutionId: user.institutionId, ownerType: 'student', ownerId: { $in: ownerIds } }).populate('ownerId').populate('institutionId').sort({ createdAt: -1 });
    if (!card) {
      const now = new Date();
      const validityEnd = new Date(now);
      validityEnd.setFullYear(now.getFullYear() + 1);
      const cardNumber = await makeCardNumber('student', user.institutionId);
      const created = await IDCard.create({ ownerId: student.userId?._id || student.userId || user._id, ownerType: 'student', cardNumber, cardType: 'student', photoUrl: student.userId?.avatar || user.avatar || '', qrCodeData: `easy_school://idcard/${cardNumber}`, barcodeData: cardNumber, validityStart: now, validityEnd, status: 'active', issuedBy: user._id || user.id, issuedAt: now, institutionId: user.institutionId, downloadCount: 0 });
      card = await IDCard.findById(created._id).populate('ownerId').populate('institutionId');
    }
    return res.json({ card, student, institution: student.institutionId, generated: true });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to load my ID card safely', error: error?.message || String(error) });
  }
};

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
  if (['staff', 'finance_officer', 'librarian', 'student', 'parent', 'class_teacher', 'teacher', 'subject_teacher'].includes(req.user.role)) return res.status(403).json({ message: 'Access denied. This role cannot scan ID cards.' });
  if (leaderRoles.includes(req.user.role) || (Array.isArray(req.user.permissions) && req.user.permissions.includes('scan:idcard'))) return next();
  return res.status(403).json({ message: 'Access denied. Cannot scan ID cards.' });
};

router.get('/student/:studentId', authenticate, idCardGenerateGuard, generateStudentIdCard);
router.get('/teacher/:teacherId', authenticate, idCardGenerateGuard, generateTeacherIdCard);
router.get('/staff/:staffId', authenticate, idCardGenerateGuard, generateStaffIdCard);
router.get('/me/card', authenticate, safeMyIdCard);
router.get('/child/:studentId/card', authenticate, getChildIdCard);
router.get('/owners/search', authenticate, idCardGenerateGuard, searchIdCardOwners);
router.post('/admit-card/pdf', authenticate, idCardGenerateGuard, renderServerAdmitCardPdf);
router.post('/', authenticate, idCardGenerateGuard, generateIdCardRecord);
router.post('/generate', authenticate, idCardGenerateGuard, generateIdCardRecord);
router.post('/bulk', authenticate, idCardGenerateGuard, bulkGenerateIdCards);
router.post('/render-pdf', authenticate, renderCardPdf);
router.get('/:id/download', authenticate, idCardReadGuard, downloadIdCard);
router.post('/:id/email', authenticate, idCardManageGuard, emailIdCard);
router.post('/verify', authenticate, idCardScanGuard, verifyByQRCode);
router.post('/:id/renew', authenticate, idCardManageGuard, renewIdCard);
router.get('/reports/stats', authenticate, idCardManageGuard, idCardStats);
router.get('/', authenticate, idCardManageGuard, getAllIdCards);
router.get('/:id', authenticate, idCardReadGuard, getIdCardById);

export default router;
