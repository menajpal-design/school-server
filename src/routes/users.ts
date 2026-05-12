import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();
const platformAdminRoles = ['admin', 'super_admin'];
const validRoles = ['admin', 'super_admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];
const schoolManagedRoles = ['assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];

const isPlatformAdmin = (role?: string) => platformAdminRoles.includes(role || '');

const scopedUserQuery = (req: any) => isPlatformAdmin(req.user?.role) ? {} : { institutionId: req.user.institutionId };

router.use(authenticate);
router.use(authorize('head', 'admin', 'super_admin'));

router.get('/', (req, res) => {
  User.find(scopedUserQuery(req))
    .select('name username email role phone avatar isActive lastLogin permissions institutionId createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/all', (req, res) => {
  User.find(scopedUserQuery(req))
    .select('name username email role phone avatar isActive lastLogin permissions institutionId createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/permissions', (req, res) => {
  User.find(scopedUserQuery(req))
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
      { _id: req.params.id, ...scopedUserQuery(req) },
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
    const nextRole = String(req.body.role || '');
    if (!validRoles.includes(nextRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (!isPlatformAdmin(req.user.role) && !schoolManagedRoles.includes(nextRole)) {
      return res.status(403).json({ message: 'Head can assign only institution roles below Head' });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...scopedUserQuery(req), ...(isPlatformAdmin(req.user.role) ? {} : { role: { $nin: platformAdminRoles.concat('head') } }) },
      { role: nextRole },
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
    const user = await User.findOne({ _id: req.params.id, ...scopedUserQuery(req) });
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
    if (!['head', 'admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ message: 'Only Head or Admin can update permissions' });
    const matrix = req.body.matrix || {};
    await Promise.all(Object.entries(matrix).map(([role, permissions]) =>
      User.updateMany(
        { ...scopedUserQuery(req), role },
        { permissions: Array.isArray(permissions) ? permissions : [] }
      )
    ));
    res.json({ message: 'Permissions updated', matrix });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update permissions', error });
  }
});

export default router;
