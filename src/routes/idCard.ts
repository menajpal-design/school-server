import express from 'express';
import { generateStudentIdCard, generateTeacherIdCard, generateStaffIdCard, bulkGenerateIdCards, downloadIdCard, emailIdCard, verifyByQRCode, renewIdCard, idCardStats, getAllIdCards, getIdCardById, getMyIdCard, searchIdCardOwners, generateIdCardRecord, renderCardPdf } from '../controllers/idCard';
import { authenticate, canDownloadIDCard, canGenerateIDCard, canManageIDCard, canScanIDCard } from '../middleware/auth';

const router = express.Router();

router.get('/student/:studentId', authenticate, canDownloadIDCard(), generateStudentIdCard);
router.get('/teacher/:teacherId', authenticate, canDownloadIDCard(), generateTeacherIdCard);
router.get('/staff/:staffId', authenticate, canDownloadIDCard(), generateStaffIdCard);
router.get('/me/card', authenticate, getMyIdCard);
router.get('/owners/search', authenticate, canGenerateIDCard(), searchIdCardOwners);
router.post('/', authenticate, canGenerateIDCard(), generateIdCardRecord);
router.post('/generate', authenticate, canGenerateIDCard(), generateIdCardRecord);
router.post('/bulk', authenticate, canGenerateIDCard(), bulkGenerateIdCards);
router.post('/render-pdf', authenticate, canDownloadIDCard(), renderCardPdf);

// Download by card id
router.get('/:id/download', authenticate, canDownloadIDCard(), downloadIdCard);

// Email a card (managers)
router.post('/:id/email', authenticate, canManageIDCard(), emailIdCard);

// Verify QR code
router.post('/verify', authenticate, canScanIDCard(), verifyByQRCode);

// Renew
router.post('/:id/renew', authenticate, canManageIDCard(), renewIdCard);

// Stats
router.get('/reports/stats', authenticate, canManageIDCard(), idCardStats);
router.get('/', authenticate, canManageIDCard(), getAllIdCards);
router.get('/:id', authenticate, canDownloadIDCard(), getIdCardById);

export default router;
