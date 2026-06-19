import express from 'express';
import activeRouter from './attendanceActiveSafe';
import fingerprintRouter from './attendanceFingerprint';

const router = express.Router();
router.use(fingerprintRouter);
router.use(activeRouter);

export default router;
