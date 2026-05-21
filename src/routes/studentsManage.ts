import express from 'express';
import baseRouter from './studentsUsernameOnly';
import { authenticate } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

router.use('/', baseRouter);

const normalizeRoll = (value: any) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const digits = raw.replace(/[^0-9]/g, '');
  return digits ? String(Number(digits)).padStart(2, '0') : raw;
};

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    const rawId = String(req.params.id || '');
    const userId = rawId.startsWith('user-') ? rawId.replace(/^user-/, '') : rawId;
    const update: any = {};
    if (req.body?.name) update.name = String(req.body.name).trim();
    if (req.body?.phone !== undefined) update.phone = String(req.body.phone || '').trim();
    if (req.body?.photo !== undefined) update.avatar = req.body.photo;
    if (req.body?.rollNumber !== undefined) update.rollNumber = normalizeRoll(req.body.rollNumber);

    const user = await User.findOneAndUpdate(
      { _id: userId, institutionId: req.user.institutionId, role: 'student' },
      { $set: update },
      { new: true }
    ).select('name username phone avatar role rollNumber createdAt');

    if (!user) return res.status(404).json({ message: 'Student user not found.' });

    res.json({
      student: {
        _id: `user-${user._id}`,
        rollNumber: (user as any).rollNumber || update.rollNumber || '',
        admissionDate: user.createdAt,
        isActive: true,
        userId: { _id: user._id, name: user.name, username: user.username, phone: user.phone, avatar: user.avatar },
      },
      message: 'Student roll/profile updated.',
    });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update student.' });
  }
});

export default router;
