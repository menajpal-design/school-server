import jwt from 'jsonwebtoken';
import { NextFunction, Request, Response } from 'express';
import User from '../models/User';
import Institution from '../models/Institution';

const platformAdminRoles = ['admin', 'super_admin'];

const allowedPaths = [
  '/api/auth',
  '/api/config',
  '/api/health',
  '/api/institution/profile',
  '/api/institution/billing',
  '/api/institution/plans',
  '/api/site-settings/site-config',
  '/api/site-settings/storage-status',
  '/api/site-settings/app-controls',
  '/api/academic/results/me',
];

const isAllowedPath = (path: string) => allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));

const getActiveAcademicYearStorage = (settings: any = {}) => {
  if (!Array.isArray(settings.academicYears)) return {};
  return settings.academicYears.find((item: any) => item?.isActive || item?.year === settings.activeAcademicYear) || {};
};

const isUsingEasySchoolStorage = (billing: any = {}) => {
  // Existing schools may not have this field saved yet. In this app the default is EasySchool storage.
  if (billing.useEasySchoolStorage === undefined || billing.useEasySchoolStorage === null) return true;
  return billing.useEasySchoolStorage !== false;
};

const needsStorageConfig = (institution: any) => {
  if (!institution) return false;

  const billing = institution.billing || {};
  const settings = institution.settings || {};

  // If the school selected/paid for EasySchool storage, do not require personal MongoDB/ImgBB.
  // Personal MongoDB + ImgBB are required only when EasySchool storage is disabled.
  if (isUsingEasySchoolStorage(billing)) return false;

  const mongoUri = String(getActiveAcademicYearStorage(settings).mongodbUri || settings.mongodbUri || '').trim();
  return !mongoUri;
};

const resolveInstitutionId = (decoded: any) => {
  if (!decoded) return '';
  if (typeof decoded.institutionId === 'string') return decoded.institutionId;
  if (decoded.institutionId && typeof decoded.institutionId === 'object' && decoded.institutionId._id) {
    return String(decoded.institutionId._id);
  }
  return '';
};

export const storageConfigGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/api') || isAllowedPath(path)) return next();

    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    const institutionId = resolveInstitutionId(decoded);

    if (!institutionId) return next();

    const institution = await Institution.findById(institutionId).select('billing settings').lean().maxTimeMS(2500);
    if (!institution) return next();

    let user: any = null;
    if (decoded.id) {
      user = await User.findById(decoded.id).select('role institutionId isActive').lean().maxTimeMS(2500);
    }

    if (user && (user.isActive === false || platformAdminRoles.includes(user.role) || !user.institutionId)) {
      return next();
    }

    if (needsStorageConfig(institution)) {
      return res.status(428).json({
        code: 'STORAGE_CONFIG_REQUIRED',
        redirectTo: '/settings',
        message: 'দয়া করে MongoDB URL সেট করুন। Local storage ব্যবহার না করলে নতুন ডাটা তৈরি, ফাইল/ছবি আপলোড বা ডাটাবেস ব্যবহারের আগে প্রয়োজনীয় storage configuration দিতে হবে।',
      });
    }

    return next();
  } catch (error) {
    return next();
  }
};

export default storageConfigGuard;
