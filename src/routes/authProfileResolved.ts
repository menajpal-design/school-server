import express from 'express';
import Institution from '../models/Institution';
import { authenticate } from '../middleware/auth';
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

router.get('/profile', authenticate, async (req: any, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: 'User not found' });
    const resolved = await resolveProfileForUser(user);
    const institution = resolved.institution || req.institution || user.institution || await Institution.findById(user.institutionId).lean().catch(() => null);
    res.json({
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
    res.status(500).json({ message: 'Failed to resolve profile', error: error?.message || String(error) });
  }
});

export default router;
