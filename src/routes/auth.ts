import express from 'express';
import { register, login, getProfile, updateProfile, changePassword } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth';

const router = express.Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

export default router;
