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
  '/api/institution/billing/payment',
  '/api/institution/plans',
  '/api/site-settings/site-config',
  '/api/site-settings/app-controls',
];

const isAllowedPath = (path: string) => allowedPaths.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));

const getActiveAcademicYearStorage = (settings: any = {}) => {
  if (!Array.isArray(settings.academicYears)) return {};
  return settings.academicYears.find((item: any) => item?.isActive || item?.year === settings.activeAcademicYear) || {};
};

const needsStorageConfig = (institution: any) => {
  if (!institution) return false;
  const billing = institution.billing || {};
  const settings = institution.settings || {};
  const activeAcademicYear = getActiveAcademicYearStorage(settings);
  const usesEasySchoolStorage = billing.useEasySchoolStorage !== false;
  if (usesEasySchoolStorage) return false;

  const mongoUri = String(activeAcademicYear.mongodbUri || settings.mongodbUri || '').trim();
  const imgbbApiKey = String(activeAcademicYear.imgbbApiKey || settings.imgbbApiKey || '').trim();
  return !mongoUri || !imgbbApiKey;
};

export const storageConfigGuard = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const path = req.originalUrl.split('?')[0];
    if (!path.startsWith('/api') || isAllowedPath(path)) return next();

    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) return next();

    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    const user = await User.findById(decoded.id).select('role institutionId isActive').lean().maxTimeMS(2500);
    if (!user || !user.isActive || platformAdminRoles.includes(user.role) || !user.institutionId) return next();

    const institution = await Institution.findById(user.institutionId).select('billing settings').lean().maxTimeMS(2500);
    if (!needsStorageConfig(institution)) return next();

    return res.status(428).json({
      code: 'STORAGE_CONFIG_REQUIRED',
      redirectTo: '/settings',
      message: 'দয়া করে MongoDB URL এবং ImgBB API Key সেট করুন। EasySchool storage ব্যবহার না করলে নতুন ডাটা তৈরি, ফাইল/ছবি আপলোড বা ডাটাবেস ব্যবহারের আগে প্রয়োজনীয় storage configuration দিতে হবে।',
    });
  } catch (error) {
    return next();
  }
};

export default storageConfigGuard;
