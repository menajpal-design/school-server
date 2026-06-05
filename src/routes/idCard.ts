import express from 'express';
import { generateStudentIdCard, generateTeacherIdCard, generateStaffIdCard, bulkGenerateIdCards, downloadIdCard, emailIdCard, verifyByQRCode, renewIdCard, idCardStats, getAllIdCards, getIdCardById, getMyIdCard, getChildIdCard, searchIdCardOwners, generateIdCardRecord, renderCardPdf } from '../controllers/idCard';
import { authenticate, canDownloadIDCard, canGenerateIDCard, canManageIDCard, canScanIDCard } from '../middleware/auth';

const router = express.Router();

router.get('/student/:studentId', authenticate, canDownloadIDCard(), generateStudentIdCard);
router.get('/teacher/:teacherId', authenticate, canDownloadIDCard(), generateTeacherIdCard);
router.get('/staff/:staffId', authenticate, canDownloadIDCard(), generateStaffIdCard);
router.get('/me/card', authenticate, getMyIdCard);
router.get('/child/:studentId/card', authenticate, getChildIdCard);
router.get('/owners/search', authenticate, canGenerateIDCard(), searchIdCardOwners);
router.post('/', authenticate, canGenerateIDCard(), generateIdCardRecord);
router.post('/generate', authenticate, canGenerateIDCard(), generateIdCardRecord);
router.post('/bulk', authenticate, canGenerateIDCard(), bulkGenerateIdCards);
router.post('/render-pdf', authenticate, canDownloadIDCard(), renderCardPdf);
router.get('/:id/download', authenticate, canDownloadIDCard(), downloadIdCard);
router.post('/:id/email', authenticate, canManageIDCard(), emailIdCard);
router.post('/verify', authenticate, canScanIDCard(), verifyByQRCode);
router.post('/:id/renew', authenticate, canManageIDCard(), renewIdCard);
router.get('/reports/stats', authenticate, canManageIDCard(), idCardStats);
router.get('/', authenticate, canManageIDCard(), getAllIdCards);
router.get('/:id', authenticate, canDownloadIDCard(), getIdCardById);

export default router;
