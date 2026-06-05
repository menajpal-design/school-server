import express from 'express';
import { generateStudentIdCard, generateTeacherIdCard, generateStaffIdCard, bulkGenerateIdCards, downloadIdCard, emailIdCard, verifyByQRCode, renewIdCard, idCardStats, getAllIdCards, getIdCardById, getMyIdCard, getChildIdCard, searchIdCardOwners, generateIdCardRecord, renderCardPdf } from '../controllers/idCard';
import { authenticate, canDownloadIDCard } from '../middleware/auth';
import { requireAction } from '../services/permissionPolicy';

const router = express.Router();

router.get('/student/:studentId', authenticate, canDownloadIDCard(), generateStudentIdCard);
router.get('/teacher/:teacherId', authenticate, canDownloadIDCard(), generateTeacherIdCard);
router.get('/staff/:staffId', authenticate, canDownloadIDCard(), generateStaffIdCard);
router.get('/me/card', authenticate, getMyIdCard);
router.get('/child/:studentId/card', authenticate, getChildIdCard);
router.get('/owners/search', authenticate, requireAction('idcard:generate'), searchIdCardOwners);
router.post('/', authenticate, requireAction('idcard:generate'), generateIdCardRecord);
router.post('/generate', authenticate, requireAction('idcard:generate'), generateIdCardRecord);
router.post('/bulk', authenticate, requireAction('idcard:generate'), bulkGenerateIdCards);
router.post('/render-pdf', authenticate, canDownloadIDCard(), renderCardPdf);
router.get('/:id/download', authenticate, canDownloadIDCard(), downloadIdCard);
router.post('/:id/email', authenticate, requireAction('idcard:manage'), emailIdCard);
router.post('/verify', authenticate, requireAction('idcard:scan'), verifyByQRCode);
router.post('/:id/renew', authenticate, requireAction('idcard:manage'), renewIdCard);
router.get('/reports/stats', authenticate, requireAction('idcard:manage'), idCardStats);
router.get('/', authenticate, requireAction('idcard:manage'), getAllIdCards);
router.get('/:id', authenticate, canDownloadIDCard(), getIdCardById);

export default router;
