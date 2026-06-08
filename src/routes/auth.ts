import express from 'express';
import { register, login, updateProfile, changePassword, logout, refreshToken } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth';
import Institution from '../models/Institution';
import { resolveProfileForUser } from '../services/userProfileResolver';

const router = express.Router();

const serializeInstitution = (institution: any) => institution ? {
  _id: institution._id || institution.id,
  id: institution._id || institution.id,
  name: institution.name,
  type: institution.type,
  email: institution.email,
  phone: institution.phone,
  address: institution.address,
  logo: institution.logo,
  logoUrl: institution.logoUrl,
  website: institution.website,
  isActive: institution.isActive,
  headName: institution.headName,
  headSignature: institution.headSignature,
} : null;

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);

router.get('/profile', authenticate, async (req: any, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: 'User not found' });
    const resolved = await resolveProfileForUser(user);
    const institution = resolved.institution || req.institution || user.institution || await Institution.findById(user.institutionId).lean().catch(() => null);
    return res.json({
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        institutionId: institution?._id || user.institutionId,
        institution: serializeInstitution(institution),
        permissions: user.permissions || [],
        roleDetails: resolved.roleDetails,
        student: resolved.student,
        teacher: resolved.teacher,
        staff: resolved.staff,
        parent: resolved.parent,
        committee: resolved.committee,
        children: resolved.children || [],
        profileMissing: resolved.profileMissing,
        profileMissingReason: resolved.profileMissingReason,
        ambiguousMatches: resolved.ambiguousMatches || [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to resolve profile', error: error?.message || String(error) });
  }
});

router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

router.post('/forgot-password', async (_req, res) => {
  return res.status(501).json({ message: 'Password reset is temporarily unavailable. Please contact school administrator.' });
});

router.get('/check-users', async (_req, res) => {
  return res.json({ message: 'User check endpoint is available' });
});

export default router;
