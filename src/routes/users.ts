import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, authorize } from '../middleware/auth';
import getTenantIdFromReq from '../utils/tenant';
import User from '../models/User';

const router = express.Router();
const platformAdminRoles = ['admin', 'super_admin'];
const validRoles = ['admin', 'super_admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];
const schoolManagedRoles = ['assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];
const roleHierarchy = ['super_admin', 'admin', 'head', 'assistant_head', 'class_teacher', 'subject_teacher', 'teacher', 'finance_officer', 'staff', 'student', 'parent', 'committee_member'];

const isPlatformAdmin = (role?: string) => platformAdminRoles.includes(role || '');
const getManagedRoles = (role?: string) => {
  const index = roleHierarchy.indexOf(role || '');
  return index >= 0 ? roleHierarchy.slice(index + 1) : [];
};

const scopedUserQuery = (req: any) => {
  if (isPlatformAdmin(req.user?.role)) return {};
  const tenantId = getTenantIdFromReq(req);
  return tenantId ? { institutionId: tenantId } : {};
};

const buildUserListQuery = (req: any) => {
  const baseQuery: any = { ...scopedUserQuery(req) };

  if (req.query?.institutionId && req.query.institutionId !== 'all') {
    baseQuery.institutionId = req.query.institutionId;
  }

  if (req.query?.role && req.query.role !== 'all') {
    baseQuery.role = req.query.role;
  }

  if (req.query?.search) {
    const pattern = new RegExp(String(req.query.search), 'i');
    baseQuery.$or = [
      { name: pattern },
      { username: pattern },
      { email: pattern },
      { phone: pattern },
    ];
  }

  if (isPlatformAdmin(req.user?.role)) {
    return baseQuery;
  }

  const managedRoles = getManagedRoles(req.user?.role);
  const roleCondition = managedRoles.length ? { role: { $in: managedRoles } } : null;

  return roleCondition
    ? { ...baseQuery, $or: baseQuery.$or ? [...baseQuery.$or, roleCondition, { _id: req.user._id }] : [roleCondition, { _id: req.user._id }] }
    : { ...baseQuery, _id: req.user._id };
};

router.use(authenticate);

// === Routes accessible by broader roles (placed BEFORE global authorize) ===

// Get subordinate users (teachers, staff, class_teachers etc. also need this)
router.get('/subordinates/list', async (req: any, res: any) => {
  try {
    const userRole = req.user?.role;
    const userId = req.user?.id;
    const institutionId = getTenantIdFromReq(req);

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
    if (!visibleRoles.length) return res.json({ users: [] });

    const query: any = { $or: [{ role: { $in: visibleRoles } }, { _id: userId }] };
    if (!isPlatformAdmin(userRole) && institutionId) query.institutionId = institutionId;

    const subordinates = await User.find(query)
      .select('_id name username email role phone isActive createdAt')
      .sort({ role: 1, name: 1 })
      .limit(500);

    res.json({ users: subordinates });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch subordinates', error });
  }
});

// View credentials for a specific user
router.get('/view-credentials/:id', async (req: any, res: any) => {
  try {
    const targetUserId = req.params.id;
    const userRole = req.user?.role;
    const institutionId = getTenantIdFromReq(req);

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return res.status(404).json({ message: 'User not found' });

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
    if (!canSee || (!isPlatformAdmin(userRole) && targetUser.institutionId.toString() !== String(institutionId))) {
      return res.status(403).json({ message: 'You do not have permission to view this user credentials' });
    }

    res.json({
      user: { _id: targetUser._id, name: targetUser.name, email: targetUser.email, username: targetUser.username, role: targetUser.role, phone: targetUser.phone },
      credentials: { username: targetUser.username, email: targetUser.email, note: 'Password cannot be displayed for security reasons. Use "Reset Password" button to generate a temporary password.' },
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to view credentials', error });
  }
});

// === Admin/Head-only routes ===
router.use(authorize('head', 'admin', 'super_admin'));

router.get('/', (req, res) => {
  const query = buildUserListQuery(req);

  User.find(query)
    .select('name username email role phone avatar isActive lastLogin permissions institutionId createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/all', (req, res) => {
  const query = buildUserListQuery(req);

  User.find(query)
    .select('name username email role phone avatar isActive lastLogin permissions institutionId createdAt updatedAt')
    .sort({ createdAt: -1 })
    .then((users) => res.json({ users }))
    .catch((error) => res.status(500).json({ message: 'Failed to load users', error }));
});

router.get('/permissions', (req, res) => {
  const managedRoles = getManagedRoles(req.user?.role);
  if (!managedRoles.length) return res.json({ roles: [], matrix: {}, permissions: [] });

  User.find({ ...scopedUserQuery(req), role: { $in: managedRoles } })
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
    const managedRoles = getManagedRoles(req.user?.role);
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...scopedUserQuery(req), role: { $in: managedRoles } },
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
    const managedRoles = getManagedRoles(req.user?.role);
    if (!validRoles.includes(nextRole)) {
      return res.status(400).json({ message: 'Invalid role' });
    }
    if (!managedRoles.includes(nextRole)) {
      return res.status(403).json({ message: 'You can only assign lower roles.' });
    }
    const user = await User.findOneAndUpdate(
      { _id: req.params.id, ...scopedUserQuery(req), role: { $in: managedRoles } },
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
    const query = isPlatformAdmin(req.user?.role)
      ? { _id: req.params.id }
      : { _id: req.params.id, ...scopedUserQuery(req), role: { $in: getManagedRoles(req.user?.role) } };
    const user = await User.findOne(query);
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
