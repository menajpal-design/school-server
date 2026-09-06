import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import User from '../models/User';
import Institution from '../models/Institution';
import { resolveTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

export const syncUserToTenantStorage = async (tenantContext: any, user: any) => {
  if (!tenantContext || !user?._id) return;
  const plainUser = typeof user.toObject === 'function' ? user.toObject({ depopulate: true, versionKey: false }) : user;
  const payload = { ...plainUser, _id: plainUser._id, institutionId: plainUser.institutionId?._id || plainUser.institutionId };
  try {
    await runWithTenantStorage(tenantContext, async () => {
      await User.findOneAndUpdate({ _id: payload._id }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true }).maxTimeMS(5000).exec();
    });
  } catch (error) { console.warn('Tenant auth sync failed:', (error as any)?.message || error); }
};

interface AuthRequest extends Request { user: any; }
const platformAdminRoles = ['admin', 'super_admin'];
const authQueryTimeoutMs = Number(process.env.AUTH_QUERY_TIMEOUT_MS || 4000);
const authQueryMaxTimeMs = Number(process.env.AUTH_QUERY_MAX_TIME_MS || 3000);
export const normalizeRole = (role?: string) => {
  if (!role) return '';
  const normalized = String(role).toLowerCase().trim().replace(/[\s-]+/g, '_');
  if (normalized === 'guardian' || normalized === 'parent_guardian' || normalized === 'parent_guardian_role') return 'parent';
  if (normalized === 'principal' || normalized === 'headmaster') return 'head';
  return normalized;
};
const isPlatformAdminRole = (role?: string) => platformAdminRoles.includes(normalizeRole(role));
const isPrivilegedRole = (role?: string) => normalizeRole(role) === 'head';
const isIdCardLeader = (role?: string) => ['head', 'assistant_head', 'admin', 'super_admin'].includes(normalizeRole(role));
const hasPermission = (user: any, permission: string) => Array.isArray(user?.permissions) && (user.permissions.includes(permission) || user.permissions.includes(permission.replace(':', '.')));

const withAuthTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try { return await Promise.race([promise, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), authQueryTimeoutMs); })]); }
  finally { if (timer) clearTimeout(timer); }
};

const expireInstitutionSnapshotIfNeeded = (institution: any) => {
  if (!institution) return institution;
  const billing = institution?.billing || {};

  const isFree = billing.planCode === 'students_100_free' || (Number(billing.dueAmount || 0) === 0 && Number(billing.monthlyPrice || 0) === 0 && Number(billing.yearlyPrice || 0) === 0);
  if (isFree) return institution;

  // If explicitly expired/cancelled and NOT manually kept active by admin → block
  if (billing.billingStatus === 'expired') return institution;
  if (billing.billingStatus === 'cancelled') {
    institution.isActive = false;
    return institution;
  }

  // If the institution is admin-activated (isActive=true) we honour that decision
  // regardless of billingStatus (pending/trial/etc.) — the admin made a conscious override.
  // We only enforce expiry if the subscription date has actually passed.
  if (institution.isActive) {
    // Check all known expiry field aliases used across the billing layer.
    const expiresAt = billing.subscriptionExpiresAt || billing.planExpiry || billing.validUntil || billing.billingPeriodEnd || billing.expiresAt;
    if (expiresAt && new Date(expiresAt) <= new Date()) {
      institution.isActive = false;
      institution.billing = { ...billing, billingStatus: 'expired' };
      Institution.updateOne({ _id: institution._id }, { $set: { isActive: false, 'billing.billingStatus': 'expired' } }).maxTimeMS(authQueryMaxTimeMs).exec().catch((error) => console.warn('Institution expiry update failed:', error?.message || error));
    }
    return institution;
  }

  // Institution is not active — also block if billingStatus is non-active/non-trial
  if (billing.billingStatus && billing.billingStatus !== 'active' && billing.billingStatus !== 'trial') {
    return institution; // isActive is already false
  }

  // Check expiry for active/trial statuses
  const expiresAt = billing.subscriptionExpiresAt || billing.planExpiry || billing.validUntil || billing.billingPeriodEnd || billing.expiresAt;
  if (!expiresAt) return institution;
  if (new Date(expiresAt) <= new Date()) {
    institution.isActive = false;
    institution.billing = { ...billing, billingStatus: 'expired' };
    Institution.updateOne({ _id: institution._id }, { $set: { isActive: false, 'billing.billingStatus': 'expired' } }).maxTimeMS(authQueryMaxTimeMs).exec().catch((error) => console.warn('Institution expiry update failed:', error?.message || error));
  }
  return institution;
};

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization || '';
    const cookieToken = (req as any).cookies?.[process.env.AUTH_COOKIE_NAME || 'easy_school_token'] || (req as any).cookies?.token;
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (cookieToken || undefined);
    if (!token) return res.status(401).json({ message: 'Authentication required.' });
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'fallback-secret');
    const user = await runWithTenantStorage(null, () => withAuthTimeout(User.findById(decoded.id).populate('institutionId').lean().exec(), 'Auth user lookup'));
    if (!user || user.isActive === false) return res.status(401).json({ message: 'Invalid or inactive user.' });
    const institution = expireInstitutionSnapshotIfNeeded((user as any).institutionId);
    req.user = { ...user, id: String((user as any)._id), institutionId: institution?._id || (user as any).institutionId, institution };
    const tenantContext = resolveTenantStorageContext(institution);
    await syncUserToTenantStorage(tenantContext, req.user);

    // Plan-based feature restrictions for Free Lifetime plan
    const billing = institution?.billing || {};
    const isFreePlan = billing.planCode === 'students_100_free';
    if (isFreePlan) {
      const userRole = String(req.user?.role || '').toLowerCase();
      const isPlatformAdmin = userRole === 'admin' || userRole === 'super_admin';
      if (!isPlatformAdmin) {
        const blockedPrefixes = [
          '/api/id-cards',
          '/api/documents/admit-cards',
          '/api/sms',
          '/api/sms-monitoring',
          '/api/messages',
          '/api/question-bank/ai-manage',
          '/api/question-generate',
          '/api/ai-manage'
        ];
        const path = req.originalUrl.split('?')[0];
        const isBlocked = blockedPrefixes.some(prefix => path.startsWith(prefix));
        if (isBlocked) {
          return res.status(403).json({
            message: 'This feature is not available on the Free Lifetime plan. Please upgrade to a paid plan to access this feature.',
            code: 'plan_restricted'
          });
        }
      }
    }

    next();
  } catch (error: any) { return res.status(401).json({ message: 'Invalid token.' }); }
};

export const authorize = (...roles: string[]) => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (roles.some((role) => normalizeRole(role) === currentRole)) return next();
  return res.status(403).json({ message: 'Access denied.' });
};

export const canManageIDCard = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (isIdCardLeader(req.user.role) || hasPermission(req.user, 'manage:idcard')) return next();
  return res.status(403).json({ message: 'Access denied. ID card management is restricted to school leaders/admins.' });
};

export const canScanIDCard = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (['staff', 'finance_officer', 'librarian', 'student', 'parent'].includes(currentRole)) return res.status(403).json({ message: 'Access denied. This role cannot scan ID cards.' });
  if (isIdCardLeader(req.user.role) || currentRole === 'class_teacher' || hasPermission(req.user, 'scan:idcard') || hasPermission(req.user, 'attendance:mark')) return next();
  return res.status(403).json({ message: 'Access denied. Cannot scan ID cards.' });
};

export const canDownloadIDCard = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (isIdCardLeader(req.user.role) || ['student', 'parent', 'teacher', 'subject_teacher', 'class_teacher', 'staff'].includes(currentRole)) return next();
  if (hasPermission(req.user, 'download:idcard')) return next();
  return res.status(403).json({ message: 'Access denied. Cannot download ID card.' });
};

export const canGenerateIDCard = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (isIdCardLeader(req.user.role) || hasPermission(req.user, 'generate:idcard')) return next();
  return res.status(403).json({ message: 'Access denied. ID card generation is restricted to school leaders/admins.' });
};

export const canEditIDCard = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  if (isIdCardLeader(req.user.role) || hasPermission(req.user, 'edit:idcard')) return next();
  return res.status(403).json({ message: 'Access denied. ID card editing is restricted to school leaders/admins.' });
};

export const canManageFinance = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (isPrivilegedRole(req.user.role) || currentRole === 'assistant_head' || currentRole === 'finance_officer' || hasPermission(req.user, 'manage:finance')) return next();
  return res.status(403).json({ message: 'Access denied. Finance management only.' });
};
export const canManageAcademic = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (['admin', 'super_admin'].includes(currentRole)) return res.status(403).json({ message: 'Admin roles cannot access academic or attendance operations.' });
  if (isPrivilegedRole(req.user.role) || ['class_teacher', 'subject_teacher', 'assistant_head', 'teacher', 'staff', 'finance_officer'].includes(currentRole) || hasPermission(req.user, 'manage:academic')) return next();
  return res.status(403).json({ message: 'Access denied. Academic management only.' });
};
export const canPostNotice = () => (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.user) return res.status(401).json({ message: 'Authentication required.' });
  const currentRole = normalizeRole(req.user.role);
  if (isPrivilegedRole(req.user.role) || ['assistant_head', 'committee_member', 'staff'].includes(currentRole) || hasPermission(req.user, 'post:notice')) return next();
  return res.status(403).json({ message: 'Access denied. Cannot post notice.' });
};
