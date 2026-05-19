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

// Get subordinate users (those that current user can manage)
router.get('/subordinates/list', async (req, res) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const institutionId = req.user?.institutionId;

    // Define role hierarchy - who can see whom
    const roleHierarchy: Record<string, string[]> = {
      'super_admin': ['admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'admin': ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'head': ['assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'assistant_head': ['class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent'],
      'class_teacher': ['student', 'parent'],
      'subject_teacher': ['student', 'parent'],
      'finance_officer': ['student', 'parent'],
    };

    const visibleRoles = roleHierarchy[userRole] || [];

    if (!visibleRoles.length) {
      return res.json({ users: [] });
    }

    const query: any = { role: { $in: visibleRoles } };
    if (!isPlatformAdmin(userRole)) {
      query.institutionId = institutionId;
    }

    const subordinates = await User.find(query)
      .select('_id name username email role phone isActive createdAt')
      .sort({ role: 1, name: 1 })
      .limit(500);

    res.json({ users: subordinates });
  } catch (error) {
    console.error('Error fetching subordinates:', error);
    res.status(500).json({ message: 'Failed to fetch subordinates', error });
  }
});

// View credentials for a specific user
router.get('/view-credentials/:id', async (req, res) => {
  try {
    const targetUserId = req.params.id;
    const requestingUserId = req.user?.id;
    const userRole = req.user?.role;
    const institutionId = req.user?.institutionId;

    // Check if requesting user has permission
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check hierarchy permission
    const roleHierarchy: Record<string, string[]> = {
      'super_admin': ['admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'admin': ['head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'head': ['assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'],
      'assistant_head': ['class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent'],
      'class_teacher': ['student', 'parent'],
      'subject_teacher': ['student', 'parent'],
      'finance_officer': ['student', 'parent'],
    };

    const canSee = roleHierarchy[userRole]?.includes(targetUser.role);
    if (!canSee || (!isPlatformAdmin(userRole) && targetUser.institutionId.toString() !== institutionId.toString())) {
      return res.status(403).json({ message: 'You do not have permission to view this user credentials' });
    }

    res.json({
      user: {
        _id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        username: targetUser.username,
        role: targetUser.role,
        phone: targetUser.phone,
      },
      credentials: {
        username: targetUser.username,
        email: targetUser.email,
        note: 'Password cannot be displayed for security reasons. Use "Reset Password" button to generate a temporary password.',
      },
    });
  } catch (error) {
    console.error('Error viewing credentials:', error);
    res.status(500).json({ message: 'Failed to view credentials', error });
  }
});

export default router;
