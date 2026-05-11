import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

router.use(authenticate);
router.use(authorize('head'));

router.get('/', (req, res) => {
  User.find({ institutionId: req.user.institutionId })
    .select('name email role phone avatar isActive lastLogin permissions createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/all', (req, res) => {
  User.find({ institutionId: req.user.institutionId })
    .select('name email role phone avatar isActive lastLogin permissions createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/permissions', (req, res) => {
  User.find({ institutionId: req.user.institutionId })
    .select('role permissions')
    .then((users) => {
      const roles = [...new Set(users.map((user) => user.role))];
      const matrix = roles.reduce((acc: any, role) => {
        acc[role] = [...new Set(users.filter((user) => user.role === role).flatMap((user) => user.permissions || []))];
        return acc;
      }, {});
      res.json({ roles, matrix, permissions: [...new Set(users.flatMap((user) => user.permissions || []))] });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load permissions', error }));
});

router.patch('/:id/status', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { isActive: req.body.isActive },
      { new: true }
    ).select('name email role phone avatar isActive lastLogin permissions createdAt updatedAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user status', error });
  }
});

router.patch('/:id/role', async (req, res) => {
  try {
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, institutionId: req.user.institutionId },
      { role: req.body.role },
      { new: true }
    ).select('name email role phone avatar isActive lastLogin permissions createdAt updatedAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user role', error });
  }
});

router.post('/:id/reset-password', async (req, res) => {
  try {
    const password = String(req.body.password || 'User@123');
    const user = await User.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.password = await bcrypt.hash(password, 10);
    await user.save();
    res.json({ message: 'Password reset successfully', temporaryPassword: password });
  } catch (error) {
    res.status(500).json({ message: 'Failed to reset password', error });
  }
});

router.put('/permissions', async (req, res) => {
  try {
    if (req.user.role !== 'head') return res.status(403).json({ message: 'Only Head can update permissions' });
    const matrix = req.body.matrix || {};
    await Promise.all(Object.entries(matrix).map(([role, permissions]) =>
      User.updateMany(
        { institutionId: req.user.institutionId, role },
        { permissions: Array.isArray(permissions) ? permissions : [] }
      )
    ));
    res.json({ message: 'Permissions updated', matrix });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update permissions', error });
  }
});

export default router;
