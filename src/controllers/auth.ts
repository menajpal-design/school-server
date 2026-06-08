import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import User from '../models/User';
import Institution from '../models/Institution';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import Parent from '../models/Parent';
import { sendEmail } from '../services/emailService';
import { logger } from '../utils/logger';
import { runWithTenantStorage, resolveTenantStorageContext } from '../config/tenantStorage';
import { calculatePlanDue } from '../config/pricing';
import { generateUsername } from '../utils/usernames';
import { randomBytes, createHash } from 'crypto';

const authCookieName = process.env.AUTH_COOKIE_NAME || 'easy_school_token';
const refreshCookieName = process.env.REFRESH_COOKIE_NAME || 'easy_school_refresh';
const accessTokenExpiry = process.env.JWT_EXPIRES_IN || '24h';
const refreshTokenDays = Number(process.env.REFRESH_TOKEN_DAYS || 30);
const jwtSecret = () => process.env.JWT_SECRET || 'your-secret-key';
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
const generateRefreshToken = () => randomBytes(48).toString('hex');
const cookieOptions = (days = 0) => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'none' as const, path: '/', maxAge: days ? days * 24 * 60 * 60 * 1000 : undefined });
const serializeInstitution = (institution: any) => institution ? { _id: institution._id || institution.id, id: institution._id || institution.id, name: institution.name, type: institution.type, email: institution.email, phone: institution.phone, address: institution.address, logo: institution.logo, logoUrl: institution.logoUrl, website: institution.website, isActive: institution.isActive, headName: institution.headName, headSignature: institution.headSignature } : null;
const resolveInstitutionId = (value: any) => value?._id || value?.id || value;
const buildAuthPayload = (message: string, token: string, user: any) => ({ message, token, user });
const getRequestSubdomain = (req: Request) => String((req as any).subdomain || (req.headers['x-school-subdomain'] as string) || '').trim().toLowerCase();
const ensureDatabaseReady = async () => mongoose.connection.readyState === 1;
const normalizeRole = (role: any) => String(role || '').toLowerCase().replace(/[\s-]+/g, '_') === 'guardian' ? 'parent' : String(role || '').toLowerCase().replace(/[\s-]+/g, '_');

const syncUserToTenantStorage = async (tenantContext: any, user: any) => {
  if (!tenantContext || !user) return;
  const plainUser = typeof user.toObject === 'function' ? user.toObject() : user;
  const payload = { ...plainUser, _id: plainUser._id, institutionId: resolveInstitutionId(plainUser.institutionId) };
  try { await runWithTenantStorage(tenantContext, async () => User.findOneAndUpdate({ _id: payload._id }, { $set: payload }, { upsert: true, new: true, setDefaultsOnInsert: true }).maxTimeMS(5000).exec()); } catch (error) { console.warn('Tenant user sync failed:', (error as any)?.message || error); }
};

export const register = async (req: Request, res: Response) => {
  try {
    if (!(await ensureDatabaseReady())) return res.status(503).json({ message: 'Database is not connected' });
    if (getRequestSubdomain(req)) return res.status(403).json({ message: 'নিবন্ধন শুধুমাত্র প্রধান ডোমেইনে করা যাবে।' });
    const { email, password, phone } = req.body;
    const name = (req.body.name || `${req.body.firstName || ''} ${req.body.lastName || ''}`).trim();
    const role = 'head';
    let institutionId = req.body.institutionId;
    let institution: any = null;
    if (institutionId && mongoose.Types.ObjectId.isValid(String(institutionId))) { institution = await Institution.findById(institutionId).lean(); if (!institution) return res.status(404).json({ message: 'Institution not found' }); }
    const storageContext = institution ? resolveTenantStorageContext(institution) : null;
    const existingUser = institutionId ? await runWithTenantStorage(storageContext, async () => User.findOne({ email, institutionId })) : null;
    if (existingUser) return res.status(400).json({ message: 'User already exists' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = new mongoose.Types.ObjectId();
    if (!institutionId) {
      const billingCycle = req.body.billingCycle === 'yearly' ? 'yearly' : 'monthly';
      const selected = calculatePlanDue(req.body.planCode, billingCycle, true, 0);
      const paymentAmount = Number(req.body.receivedAmount || 0);
      institution = await Institution.create({ name: req.body.institutionName || `${name}'s Institution`, type: 'school', address: 'Not provided', phone: phone || 'Not provided', email, headId: userId, billing: { planCode: selected.plan.code, planName: selected.plan.name, studentLimit: selected.plan.studentLimit, monthlyPrice: selected.plan.monthlyPrice, yearlyPrice: selected.plan.yearlyPrice, monthlySmsLimit: selected.plan.monthlySmsLimit, yearlyDiscountPercent: selected.plan.yearlyDiscountPercent, billingCycle, useEasySchoolStorage: true, storageMonthlyPrice: 100, baseDueAmount: selected.baseAmount + selected.storageAmount, storageAmount: selected.storageAmount, dueAmount: selected.total, billingStatus: 'pending', isPaymentReceived: paymentAmount > 0 || Boolean(req.body.paymentTrxId), receivedAmount: paymentAmount, paymentGateway: req.body.paymentGateway || 'bkash', paymentTrxId: req.body.paymentTrxId, paymentSenderNumber: req.body.paymentSenderNumber, smsChargeAmount: 0, smsChargeBreakdown: {}, smsBalance: 0 }, settings: { backupSettings: { frequency: 'weekly', location: 'local', collections: [] } } });
      institutionId = institution._id;
    }
    const tenantContext = institution ? resolveTenantStorageContext(institution) : null;
    const user = new User({ _id: userId, name, username: await generateUsername(name, 'head'), email, password: hashedPassword, role, phone, institutionId });
    await runWithTenantStorage(tenantContext, async () => user.save());
    const populatedUser = await runWithTenantStorage(tenantContext, async () => User.findById(user._id).populate('institutionId'));
    if (tenantContext) await syncUserToTenantStorage(tenantContext, populatedUser || user);
    const token = (jwt as any).sign({ id: user._id, institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
    res.cookie(authCookieName, token, cookieOptions(0));
    res.json(buildAuthPayload('Registration successful', token, { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, phone: user.phone, institutionId, institution: serializeInstitution(institution) }));
  } catch (error) { console.error('Registration error:', error); res.status(500).json({ message: 'Server error', error: String(error) }); }
};

export const login = async (req: Request, res: Response) => {
  try {
    if (!(await ensureDatabaseReady())) return res.status(503).json({ message: 'Database is not connected' });
    const identifier = String(req.body.identifier || req.body.email || req.body.username || '').trim();
    const password = String(req.body.password || '');
    const emailQuery = identifier.toLowerCase();
    let institutionId = String(req.body.institutionId || (req as any).institutionId || '').trim();
    let tenantInstitution: any = (req as any).institution || null;
    if (!tenantInstitution && institutionId && mongoose.Types.ObjectId.isValid(institutionId)) tenantInstitution = await Institution.findById(institutionId).lean();
    if (!tenantInstitution && getRequestSubdomain(req)) tenantInstitution = await Institution.findOne({ subdomain: getRequestSubdomain(req) }).lean().catch(() => null);
    if (tenantInstitution) institutionId = String(tenantInstitution._id || tenantInstitution.id);
    let tenantContext = tenantInstitution ? resolveTenantStorageContext(tenantInstitution) : null;
    const loginLookup = async () => {
      let user = await User.findOne({ $or: [{ email: emailQuery }, { username: emailQuery }, { phone: identifier }] }).populate('institutionId').maxTimeMS(5000);
      let isMatch = user ? await bcrypt.compare(password, user.password) : false;
      if (!user) {
        const student = await Student.findOne({ $or: [{ rollNumber: identifier }, { guardianPhone: identifier }, { guardianEmail: emailQuery }] }).select('userId').maxTimeMS(5000);
        if (student?.userId) { user = await User.findOne({ _id: student.userId, role: 'student' }).populate('institutionId').maxTimeMS(5000); isMatch = user ? await bcrypt.compare(password, user.password) : false; }
      }
      return { user, isMatch };
    };
    const tenantResult = tenantContext ? await runWithTenantStorage(tenantContext, loginLookup).catch(() => null) : null;
    const loginResult = tenantResult || await loginLookup();
    const { user, isMatch } = loginResult || {} as any;
    if (!user || !isMatch) return res.status(400).json({ message: 'Invalid credentials', errors: [user ? 'Incorrect password' : 'User not found'] });
    if (!getRequestSubdomain(req)) { const allowedRoles = ['head', 'super_admin', 'superadmin', 'admin', 'platform_admin']; if (!allowedRoles.includes(user.role)) return res.status(403).json({ message: 'লগইন করতে আপনার স্কুলের সাবডোমেনে ভিজিট করুন।' }); }
    void runWithTenantStorage(tenantContext, async () => User.updateOne({ _id: user._id }, { $set: { lastLogin: new Date() } }).maxTimeMS(3000).exec()).catch(() => undefined);
    if (tenantContext) await syncUserToTenantStorage(tenantContext, user);
    const token = (jwt as any).sign({ id: user._id, institutionId: (user.institutionId as any)?._id || user.institutionId || institutionId } as any, jwtSecret() as any, { expiresIn: accessTokenExpiry });
    const refreshToken = generateRefreshToken();
    const refreshHash = hashToken(refreshToken);
    const refreshExpiresAt = new Date(Date.now() + refreshTokenDays * 24 * 60 * 60 * 1000);
    await User.updateOne({ _id: user._id }, { $push: { refreshTokens: { tokenHash: refreshHash, expiresAt: refreshExpiresAt } } }).maxTimeMS(3000).exec().catch(() => undefined);
    const responseUser = { id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, isActive: user.isActive, permissions: user.permissions || [], institutionId: (user.institutionId as any)?._id || user.institutionId, institution: serializeInstitution(user.institutionId) };
    res.cookie(authCookieName, token, cookieOptions(0)); res.cookie(refreshCookieName, refreshToken, cookieOptions(refreshTokenDays));
    res.json(buildAuthPayload('Login successful', token, responseUser));
  } catch (error) { console.error('Login error:', error); res.status(500).json({ message: 'Server error', error: String(error) }); }
};

export const refreshToken = async (req: Request, res: Response) => res.status(501).json({ message: 'Refresh token not implemented in this build' });

export const getProfile = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    if (!user) return res.status(404).json({ message: 'User not found' });
    const institution = (req as any).institution || user.institution || await Institution.findById(user.institutionId).lean().catch(() => null);
    const role = normalizeRole(user.role);
    const institutionFilter = { institutionId: user.institutionId };
    let student: any = null, teacher: any = null, staff: any = null, parent: any = null;
    if (role === 'student') {
      student = await Student.findOne({ ...institutionFilter, userId: user._id }).populate('classId', 'name grade').populate('sectionId', 'name').populate('parentId', 'name phone email username').lean();
    } else if (['teacher', 'class_teacher', 'subject_teacher', 'head', 'assistant_head'].includes(role)) {
      teacher = await Teacher.findOne({ ...institutionFilter, userId: user._id }).populate('assignedClasses', 'name grade').populate('subjects', 'name code').lean();
    } else if (['staff', 'finance_officer', 'librarian'].includes(role)) {
      staff = await Staff.findOne({ ...institutionFilter, userId: user._id }).lean();
    } else if (role === 'parent') {
      parent = await Parent.findOne({ ...institutionFilter, userId: user._id }).populate({ path: 'children', populate: [{ path: 'classId', select: 'name grade' }, { path: 'sectionId', select: 'name' }, { path: 'userId', select: 'name email avatar phone role username' }] }).lean();
    }
    const roleDetails = student || teacher || staff || parent || null;
    res.json({ user: { id: user._id, _id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar, institutionId: institution?._id || user.institutionId, institution: serializeInstitution(institution), permissions: user.permissions || [], student, teacher, staff, parent, roleDetails, profileMissing: role === 'student' && !student } });
  } catch (error) { res.status(500).json({ message: 'Server error', error: String(error) }); }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone, avatar } = req.body;
    const user = await User.findById((req as any).user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.name = name || user.name; user.phone = phone || user.phone; user.avatar = avatar || user.avatar;
    await user.save();
    res.json({ message: 'Profile updated successfully', user: { id: user._id, _id: user._id, name: user.name, username: user.username, email: user.email, role: user.role, phone: user.phone, avatar: user.avatar } });
  } catch (error) { res.status(500).json({ message: 'Server error', error: String(error) }); }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById((req as any).user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ message: 'Current password is incorrect' });
    user.password = await bcrypt.hash(newPassword, 10); await user.save();
    res.json({ message: 'Password changed successfully' });
  } catch (error) { res.status(500).json({ message: 'Server error', error: String(error) }); }
};

export const logout = async (_req: Request, res: Response) => { res.clearCookie(authCookieName); res.clearCookie(refreshCookieName); res.json({ message: 'Logout successful' }); };
