import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import crypto from 'crypto';
import User from '../models/User';
import Institution from '../models/Institution';
import Student from '../models/Student';
import { generateUsername } from '../utils/credentials';
import { calculatePlanDue } from '../config/plans';
import { ensureDatabaseReady } from '../config/database';
import { resolveTenantStorageContext, runWithTenantStorage } from '../config/tenantStorage';

const getRequestSubdomain = (req: Request) => {
  const headerHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(':')[0] || '';
  const mainDomain = (process.env.MAIN_DOMAIN || '').toLowerCase();
  const hostParts = headerHost.split('.').filter(Boolean);
  let subdomain = '';

  if (mainDomain && headerHost.endsWith(mainDomain)) {
    const suffix = mainDomain.split('.').length;
    if (hostParts.length > suffix) {
      subdomain = hostParts.slice(0, hostParts.length - suffix).join('.');
    }
  } else if (headerHost.endsWith('localhost') || headerHost.endsWith('127.0.0.1')) {
    if (hostParts.length > 1) {
      subdomain = hostParts.slice(0, hostParts.length - 1).join('.');
    }
  } else {
    if (hostParts.length >= 3) subdomain = hostParts.slice(0, hostParts.length - 2).join('.');
  }
  
  if (subdomain) {
    const norm = subdomain.toLowerCase();
    if (['www', 'app', 'api', 'admin'].includes(norm)) return '';
    return norm;
  }
  return '';
};

const jwtSecret = () => process.env.JWT_SECRET || 'your_super_secret_key_with_at_least_32_characters_1234567890';

const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const authCookieName = process.env.AUTH_COOKIE_NAME || 'es_token';
const refreshCookieName = process.env.REFRESH_COOKIE_NAME || 'es_refresh';
const accessTokenExpiry = process.env.ACCESS_TOKEN_EXPIRES || '15m';
const refreshTokenDays = Number(process.env.REFRESH_TOKEN_DAYS || 7);

const cookieOptions = (days = 7) => {
  const opts: any = {
    httpOnly: true,
    secure: isProduction,
    path: '/',
    maxAge: days * 24 * 60 * 60 * 1000,
  };
  opts.sameSite = isProduction ? 'none' : 'lax';
  // Set cookie domain to allow cross-subdomain cookies when configured
  const cookieDomain = process.env.COOKIE_DOMAIN || process.env.MAIN_DOMAIN;
  if (cookieDomain) {
    // ensure leading dot for cross-subdomain cookies
    opts.domain = cookieDomain.startsWith('.') ? cookieDomain : `.${cookieDomain}`;
  }
  return opts;
};

function generateRefreshToken() {
  return crypto.randomBytes(64).toString('hex');
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

const buildAuthPayload = (message: string, token: string, user: any) => ({
  success: true,
  message,
  token,
  user,
  data: {
    token,
    user,
  },
});

const serializeInstitution = (institution: any) => {
  if (!institution || typeof institution !== 'object') {
    return institution;
  }

  return {
    id: institution._id,
    name: institution.name,
    type: institution.type,
    eiin: institution.eiin,
    address: institution.address,
    phone: institution.phone,
    email: institution.email,
    isActive: institution.isActive,
    billing: institution.billing,
  };
};

const resolveInstitutionId = (value: any) => {
  if (!value) return undefined;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value instanceof mongoose.Types.ObjectId) return String(value);
  if (value._id) return String(value._id);
  return undefined;
};

const syncUserToTenantStorage = async (tenantContext: any, user: any) => {
  if (!tenantContext || !user?._id) return;

  const plainUser = typeof user.toObject === 'function' ? user.toObject({ depopulate: true, versionKey: false }) : user;
  const payload = {
    ...plainUser,
    _id: plainUser._id,
    institutionId: resolveInstitutionId(plainUser.institutionId),
  };

  try {
    await runWithTenantStorage(tenantContext, async () => {
      await User.findOneAndUpdate(
        { _id: payload._id },
        { $set: payload },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      ).maxTimeMS(5000).exec();
    });
  } catch (error) {
    console.warn('Tenant user sync failed:', (error as any)?.message || error);
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    if (!(await ensureDatabaseReady())) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const subdomain = getRequestSubdomain(req);
    if (subdomain) {
      return res.status(403).json({ message: 'নিবন্ধন শুধুমাত্র প্রধান ডোমেইনে করা যাবে।' });
    }

    const { email, password, phone } = req.body;
    const name = (req.body.name || `${req.body.firstName || ''} ${req.body.lastName || ''}`).trim();
    const role = 'head';
    let institutionId = req.body.institutionId;

    let institution: any = null;
    if (institutionId && mongoose.Types.ObjectId.isValid(String(institutionId))) {
      institution = await Institution.findById(institutionId).lean();
      if (!institution) {
        return res.status(404).json({ message: 'Institution not found' });
      }
    }

    // Check if user already exists
    const storageContext = institution ? resolveTenantStorageContext(institution) : null;
    const existingUser = await runWithTenantStorage(storageContext, async () => User.findOne({ email }));
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const userId = new mongoose.Types.ObjectId();

    if (!institutionId) {
      const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      const selected = calculatePlanDue(req.body.planCode, billingCycle, true, 0);
      const paymentAmount = Number(req.body.receivedAmount || 0);
      institution = await Institution.create({
        name: req.body.institutionName || `${name}'s Institution`,
        type: 'school',
        address: 'Not provided',
        phone: phone || 'Not provided',
        email,
        headId: userId,
        billing: {
          planCode: selected.plan.code,
          planName: selected.plan.name,
          studentLimit: selected.plan.studentLimit,
          monthlyPrice: selected.plan.monthlyPrice,
          yearlyPrice: selected.plan.yearlyPrice,
          monthlySmsLimit: selected.plan.monthlySmsLimit,
          yearlyDiscountPercent: selected.plan.yearlyDiscountPercent,
          billingCycle,
          useEasySchoolStorage: true,
          storageMonthlyPrice: 100,
          baseDueAmount: selected.baseAmount + selected.storageAmount,
          storageAmount: selected.storageAmount,
          dueAmount: selected.total,
          billingStatus: 'pending',
          isPaymentReceived: paymentAmount > 0 || Boolean(req.body.paymentTrxId),
          receivedAmount: paymentAmount,
          paymentGateway: req.body.paymentGateway || 'bkash',
          paymentTrxId: req.body.paymentTrxId,
          paymentSenderNumber: req.body.paymentSenderNumber,
              smsChargeAmount: 0,
              smsChargeBreakdown: {},
              smsBalance: 0,
        },
        settings: {
          backupSettings: {
            frequency: 'weekly',
            location: 'local',
            collections: [],
          },
        },
      });
      institutionId = institution._id;
    }

    const tenantContext = institution ? resolveTenantStorageContext(institution) : null;

    // Create user
    const user = new User({
      _id: userId,
      name,
      username: await generateUsername(name, 'head'),
      email,
      password: hashedPassword,
      role,
      phone,
      institutionId
    });

    await runWithTenantStorage(tenantContext, async () => {
      await user.save();
    });
    const populatedUser = await runWithTenantStorage(tenantContext, async () => User.findById(user._id).populate('institutionId'));

    // Generate access token (short-lived) and refresh token (rotating)
    const token = (jwt as any).sign({ id: user._id, institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

    // Save refresh token hash to user
    try {
      await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: refreshHash, expiresAt: refreshExpiresAt } } }).maxTimeMS(3000).exec();
    } catch (e) {
      console.warn('Failed to save refresh token:', e);
    }

    const responseUser = {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        permissions: user.permissions || [],
        institutionId,
        institution: serializeInstitution(populatedUser?.institutionId) || institutionId
    };

    // Set authentication and refresh cookies
    try {
      res.cookie(authCookieName, token, cookieOptions(0)); // access token cookie short-lived (browser session)
      res.cookie(refreshCookieName, refreshToken, cookieOptions(refreshTokenDays));
    } catch (e) {
      // ignore cookie errors
    }

    res.status(201).json(buildAuthPayload('User registered successfully', token, responseUser));
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const login = async (req: Request, res: Response) => {
  try {
    if (!(await ensureDatabaseReady())) {
      return res.status(503).json({ message: 'Database is not connected' });
    }

    const identifier = (req.body.username || req.body.email || req.body.identifier || req.body.phone || req.body.mobile || '').trim();
    const { password } = req.body;

    // Validate input
    if (!identifier || !password) {
      console.warn('Login validation failed:', { hasIdentifier: !!identifier, hasPassword: !!password });
      return res.status(400).json({ 
        message: 'Validation failed',
        errors: [
          !identifier ? 'Username/email/phone is required' : null,
          !password ? 'Password is required' : null,
        ].filter(Boolean),
        details: { identifier: !identifier ? 'missing' : 'provided', password: !password ? 'missing' : 'provided' }
      });
    }

    const institutionId = String(req.headers['x-institution-id'] || req.body.institutionId || (req as any).institutionId || '');
    const institutionScope = mongoose.Types.ObjectId.isValid(institutionId) ? { institutionId } : {};
    let tenantInstitution: any = null;
    let tenantContext = null;

    if (mongoose.Types.ObjectId.isValid(institutionId)) {
      tenantInstitution = await Institution.findById(institutionId).lean().maxTimeMS(5000);
      tenantContext = resolveTenantStorageContext(tenantInstitution);
    }

    const emailQuery = identifier.includes('@') ? identifier.toLowerCase() : identifier;
    console.log('Login attempt:', { identifier, emailQuery, hasInstitutionScope: !!institutionScope.institutionId });

    const resolveInstitutionFromIdentifier = async () => {
      if (tenantInstitution || mongoose.Types.ObjectId.isValid(institutionId)) return tenantInstitution;
      try {
        return await Institution.findOne({
          $or: [
            { email: emailQuery },
            { phone: identifier },
          ],
        }).lean().maxTimeMS(5000);
      } catch {
        return null;
      }
    };

    const loginLookup = async () => {
      let user = await User.findOne({
        ...institutionScope,
        $or: [
          { email: emailQuery },
          { username: emailQuery.toLowerCase() },
          { phone: identifier },
        ],
      }).populate('institutionId').maxTimeMS(5000);

      console.log('User found by email/username/phone:', { userFound: !!user, userRole: user?.role, userEmail: user?.email });

      let isMatch = user ? await bcrypt.compare(password, user.password) : false;

      if (!isMatch) {
        const student = await Student.findOne({
          ...institutionScope,
          $or: [
            { rollNumber: identifier },
            { guardianPhone: identifier },
            { guardianEmail: emailQuery },
          ],
          isActive: true,
        }).select('userId').maxTimeMS(5000);

        console.log('Student found by rollNumber/guardianPhone/email:', { studentFound: !!student });

        if (student?.userId) {
          user = await User.findOne({ _id: student.userId, role: 'student' }).populate('institutionId').maxTimeMS(5000);
          console.log('User found via student record:', { userFound: !!user, userRole: user?.role });
          isMatch = user ? await bcrypt.compare(password, user.password) : false;
        }
      }

      return { user, isMatch };
    };

    const tenantResult = tenantContext
      ? await (async () => {
          try {
            return await runWithTenantStorage(tenantContext, loginLookup);
          } catch (error) {
            console.warn('Tenant login lookup failed, falling back to central DB:', (error as any)?.message || error);
            return null;
          }
        })()
      : null;
    const loginResult = tenantResult || (await loginLookup());

    // If no user was found in central DB and no explicit institution was provided,
    // attempt a targeted cross-tenant lookup for high-privilege accounts so that
    // admins, super_admins and school heads can sign in from the main domain.
    if (!loginResult?.user && !mongoose.Types.ObjectId.isValid(institutionId)) {
      try {
        const institutions = await Institution.find({}).select('_id').lean().maxTimeMS(5000);
        for (const inst of institutions || []) {
          try {
            const tctx = resolveTenantStorageContext(inst as any);
            if (!tctx) continue;
            const cross = await runWithTenantStorage(tctx, async () => {
              const u = await User.findOne({
                $or: [
                  { email: emailQuery },
                  { username: emailQuery.toLowerCase() },
                  { phone: identifier },
                ],
                role: { $in: ['admin', 'super_admin', 'head'] },
              }).populate('institutionId').maxTimeMS(5000);
              if (!u) return null;
              const m = await bcrypt.compare(password, u.password);
              return m ? { user: u, isMatch: true } : { user: u, isMatch: false };
            });
            if (cross?.user && cross.isMatch) {
              // Successful cross-tenant login — issue tokens and return immediately.
              const { user } = cross as any;
              const token = (jwt as any).sign({ id: user._id, institutionId: (user.institutionId as any)?._id || user.institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
              const refreshToken = generateRefreshToken();
              const refreshHash = hashToken(refreshToken);
              const refreshExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);
              try {
                await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: refreshHash, expiresAt: refreshExpiresAt } } }).maxTimeMS(3000).exec();
              } catch (e) { console.warn('Failed to save refresh token:', (e as any)?.message || e); }

              const responseUser = {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                permissions: user.permissions || [],
                institutionId: (user.institutionId as any)?._id || user.institutionId,
                institution: serializeInstitution(user.institutionId)
              };

              try {
                res.cookie(authCookieName, token, cookieOptions(0));
                res.cookie(refreshCookieName, refreshToken, cookieOptions(refreshTokenDays));
              } catch (e) {}

              return res.json(buildAuthPayload('Login successful', token, responseUser));
            }
          } catch (err) {
            // ignore tenant lookup errors and continue
            console.warn('Cross-tenant lookup error:', (err as any)?.message || err);
            continue;
          }
        }
      } catch (err) {
        console.warn('Failed to enumerate institutions for cross-tenant login:', (err as any)?.message || err);
      }
    }

    // If no user was found and no explicit institution context was provided,
    // try to infer the institution from the login identifier and retry inside tenant storage.
    if ((!loginResult?.user || !loginResult?.isMatch) && !mongoose.Types.ObjectId.isValid(institutionId)) {
      const inferredInstitution = await resolveInstitutionFromIdentifier();
      if (inferredInstitution) {
        tenantInstitution = inferredInstitution;
        tenantContext = resolveTenantStorageContext(inferredInstitution);
        if (tenantContext) {
          try {
            const inferredResult = await runWithTenantStorage(tenantContext, loginLookup);
            if (inferredResult?.user && inferredResult?.isMatch) {
              const { user, isMatch } = inferredResult;
              const subdomain = getRequestSubdomain(req);
              if (!subdomain) {
                const allowedRoles = ['head', 'superadmin', 'admin', 'platform_admin'];
                if (!allowedRoles.includes(user.role)) {
                  return res.status(403).json({ message: 'লগইন করতে আপনার স্কুলের সাবডোমেনে ভিজিট করুন।' });
                }
              }
              const token = (jwt as any).sign({ id: user._id, institutionId: (user.institutionId as any)?._id || user.institutionId || institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
              const refreshToken = generateRefreshToken();
              const refreshHash = hashToken(refreshToken);
              const refreshExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);
              try {
                await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: refreshHash, expiresAt: refreshExpiresAt } } }).maxTimeMS(3000).exec();
              } catch (e) { console.warn('Failed to save refresh token:', (e as any)?.message || e); }

              const responseUser = {
                id: user._id,
                name: user.name,
                username: user.username,
                email: user.email,
                role: user.role,
                phone: user.phone,
                isActive: user.isActive,
                permissions: user.permissions || [],
                institutionId: (user.institutionId as any)?._id || user.institutionId,
                institution: serializeInstitution(user.institutionId)
              };

              try {
                res.cookie(authCookieName, token, cookieOptions(0));
                res.cookie(refreshCookieName, refreshToken, cookieOptions(refreshTokenDays));
              } catch (e) {}

              return res.json(buildAuthPayload('Login successful', token, responseUser));
            }
          } catch (error) {
            console.warn('Inferred institution login lookup failed:', (error as any)?.message || error);
          }
        }
      }
    }

    const { user, isMatch } = tenantContext && !loginResult?.user ? await loginLookup() : loginResult;

    if (!user || !isMatch) {
      const errorMsg = user ? 'Incorrect password' : 'User not found';
      console.warn('Login failed:', { identifier, userFound: !!user, passwordMatch: isMatch, error: errorMsg });
      return res.status(400).json({ 
        message: 'Invalid credentials',
        errors: [errorMsg],
      });
    }

    const subdomain = getRequestSubdomain(req);
    if (!subdomain) {
      const allowedRoles = ['head', 'superadmin', 'admin', 'platform_admin'];
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({ message: 'লগইন করতে আপনার স্কুলের সাবডোমেনে ভিজিট করুন।' });
      }
    }

    // Update last login
    void runWithTenantStorage(tenantContext, async () => {
      await User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } }).maxTimeMS(3000).exec();
    }).catch((error) => {
      console.warn('Last login update failed:', error?.message || error);
    });

    if (tenantContext) {
      await syncUserToTenantStorage(tenantContext, user);
    }

    // Generate access token and refresh token
    const token = (jwt as any).sign({ id: user._id, institutionId: (user.institutionId as any)?._id || user.institutionId || institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);
    try {
      await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: refreshHash, expiresAt: refreshExpiresAt } } }).maxTimeMS(3000).exec();
    } catch (e) { console.warn('Failed to save refresh token:', (e as any)?.message || e); }

    const responseUser = {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        isActive: user.isActive,
        permissions: user.permissions || [],
        institutionId: (user.institutionId as any)?._id || user.institutionId,
        institution: serializeInstitution(user.institutionId)
    };

    try {
      res.cookie(authCookieName, token, cookieOptions(0));
      res.cookie(refreshCookieName, refreshToken, cookieOptions(refreshTokenDays));
    } catch (e) {}

    res.json(buildAuthPayload('Login successful', token, responseUser));
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error', error: String(error) });
  }
};

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const institution = (req as any).institution || user.institution;
    res.json({
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        institutionId: institution?._id || user.institutionId,
        institution: serializeInstitution(institution),
        permissions: user.permissions
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findById((req as any).user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.name = name || user.name;
    user.phone = phone || user.phone;
    user.avatar = avatar || user.avatar;

    await user.save();

    res.json({
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById((req as any).user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const logout = async (req: Request, res: Response) => {
  try {
    // Clear auth and refresh cookies
    try {
      (res as any).clearCookie(authCookieName, cookieOptions());
      (res as any).clearCookie(refreshCookieName, cookieOptions());
    } catch (e) {}

    // If refresh token provided, remove it from DB
    try {
      const provided = req.cookies?.[refreshCookieName] || req.body.refreshToken || '';
      if (provided) {
        const hash = hashToken(provided);
        await User.updateOne({ 'refreshTokens.tokenHash': hash }, { $pull: { refreshTokens: { tokenHash: hash } } }).exec();
      }
    } catch (e) {
      // ignore
    }

    res.json({ success: true, message: 'Logged out' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to logout', error: String(error) });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const provided = req.cookies?.[refreshCookieName] || req.body.refreshToken || req.header('x-refresh-token') || '';
    if (!provided) return res.status(400).json({ message: 'No refresh token provided' });
    const hash = hashToken(provided);

    // Find user with this refresh token
    const user = await User.findOne({ 'refreshTokens.tokenHash': hash }).exec();
    if (!user) return res.status(401).json({ message: 'Invalid refresh token' });

    // Find the saved token and check expiry
    const tokenEntry = (user as any).refreshTokens?.find((t: any) => t.tokenHash === hash);
    if (!tokenEntry) return res.status(401).json({ message: 'Invalid refresh token' });
    if (tokenEntry.expiresAt && new Date(tokenEntry.expiresAt) <= new Date()) {
      // remove expired token
      await User.updateOne({ _id: user._id }, { $pull: { refreshTokens: { tokenHash: hash } } }).exec();
      return res.status(401).json({ message: 'Refresh token expired' });
    }

    // Rotate: issue new refresh token and remove the old one
    const newRefresh = generateRefreshToken();
    const newHash = hashToken(newRefresh);
    const newExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);

    await User.updateOne({ _id: user._id, 'refreshTokens.tokenHash': hash }, { $set: { 'refreshTokens.$.tokenHash': newHash, 'refreshTokens.$.expiresAt': newExpiresAt } }).exec();

    // Issue new access token
    const access = (jwt as any).sign({ id: user._id, institutionId: (user as any).institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });

    try {
      res.cookie(authCookieName, access, cookieOptions(0));
      res.cookie(refreshCookieName, newRefresh, cookieOptions(refreshTokenDays));
    } catch (e) {}

    res.json(buildAuthPayload('Token refreshed', access, { id: user._id, name: user.name, email: user.email }));
  } catch (error) {
    res.status(500).json({ message: 'Failed to refresh token', error: String(error) });
  }
};
