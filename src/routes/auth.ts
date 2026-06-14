import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { register, login, updateProfile, changePassword, logout, refreshToken } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth';
import Institution from '../models/Institution';
import User from '../models/User';
import Student from '../models/Student';
import { runWithTenantStorage, resolveTenantStorageContext } from '../config/tenantStorage';
import { sendEmail, isEmailConfigured } from '../utils/email';
import { resolveProfileForUser } from '../services/userProfileResolver';

const router = express.Router();

const serializeInstitution = (institution: any) => institution ? {
  _id: institution._id || institution.id,
  id: institution._id || institution.id,
  name: institution.name,
  type: institution.type,
  email: institution.email,
  phone: institution.phone,
  address: institution.address,
  logo: institution.logo,
  logoUrl: institution.logoUrl,
  website: institution.website,
  isActive: institution.isActive,
  headName: institution.headName,
  headSignature: institution.headSignature,
} : null;

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.post('/logout', logout);
router.post('/refresh', refreshToken);

router.get('/profile', authenticate, async (req: any, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(404).json({ message: 'User not found' });
    const resolved = await resolveProfileForUser(user);
    const institution = resolved.institution || req.institution || user.institution || await Institution.findById(user.institutionId).lean().catch(() => null);
    return res.json({
      user: {
        id: user._id,
        _id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        phone: user.phone,
        avatar: user.avatar,
        institutionId: institution?._id || user.institutionId,
        institution: serializeInstitution(institution),
        permissions: user.permissions || [],
        roleDetails: resolved.roleDetails,
        student: resolved.student,
        teacher: resolved.teacher,
        staff: resolved.staff,
        parent: resolved.parent,
        committee: resolved.committee,
        children: resolved.children || [],
        profileMissing: resolved.profileMissing,
        profileMissingReason: resolved.profileMissingReason,
        ambiguousMatches: resolved.ambiguousMatches || [],
      },
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to resolve profile', error: error?.message || String(error) });
  }
});

router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

router.post('/forgot-password', async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ message: 'Email, username, or phone number is required.' });
    }

    const emailQuery = identifier.toLowerCase();

    // ── MULTI-TENANT CONTEXT RESOLUTION ──────────────────────────────
    // Resolve subdomain with multi-layer fallback
    const extractSubdomain = () => {
      const explicit = String(
        req.body.subdomain || 
        req.query.subdomain || 
        req.headers['x-school-subdomain'] || 
        req.headers['x-client-subdomain'] || 
        (req as any).subdomain || 
        ''
      ).trim().toLowerCase();
      
      const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin', 'mail', 'support']);
      if (explicit && !RESERVED_SUBDOMAINS.has(explicit)) return explicit;

      const host = String(req.query.domain || req.headers['x-client-domain'] || req.headers.host || req.hostname || '')
        .replace(/^https?:\/\//i, '')
        .replace(/:\d+$/, '')
        .replace(/^www\./i, '')
        .toLowerCase();

      const MAIN_DOMAIN = (process.env.MAIN_DOMAIN || 'easyschool.live').toLowerCase();
      if (!host || host === MAIN_DOMAIN || host === `www.${MAIN_DOMAIN}` || host === 'localhost' || host === '127.0.0.1') return '';
      if (host.endsWith(`.${MAIN_DOMAIN}`)) {
        const sub = host.slice(0, -1 * (`.${MAIN_DOMAIN}`).length).split('.').pop() || '';
        return RESERVED_SUBDOMAINS.has(sub) ? '' : sub;
      }
      return '';
    };

    const subdomain = extractSubdomain();
    let tenantInstitution: any = null;
    if (subdomain) {
      tenantInstitution = await Institution.findOne({ subdomain }).lean().catch(() => null);
    }
    
    // Fallback: Check if there is an institutionId in headers, query, or body
    const headerInstId = req.headers['x-institution-id'] || req.body.institutionId || req.query.institutionId;
    if (!tenantInstitution && headerInstId && mongoose.Types.ObjectId.isValid(String(headerInstId))) {
      tenantInstitution = await Institution.findById(headerInstId).lean().catch(() => null);
    }

    const tenantContext = tenantInstitution ? resolveTenantStorageContext(tenantInstitution) : null;

    // ── LOOKUP USER INSIDE TENANT CONTEXT ─────────────────────────────
    const lookupUser = async () => {
      // Look up user directly first
      let userDoc = await User.findOne({ 
        $or: [
          { email: emailQuery }, 
          { username: emailQuery }, 
          { phone: identifier }
        ] 
      }).populate('institutionId');

      // If not found, check if it's a student roll or guardian identifier
      if (!userDoc) {
        const student = await Student.findOne({ 
          $or: [
            { rollNumber: identifier }, 
            { guardianPhone: identifier }, 
            { guardianEmail: emailQuery }
          ] 
        }).select('userId').lean();

        if (student?.userId) {
          userDoc = await User.findOne({ _id: student.userId, role: 'student' }).populate('institutionId');
        }
      }

      if (!userDoc) return null;

      // Determine the email to send to
      let targetEmail = userDoc.email;
      if (!targetEmail && userDoc.role === 'student') {
        const student = await Student.findOne({ userId: userDoc._id }).select('guardianEmail').lean();
        targetEmail = student?.guardianEmail;
      }

      return { user: userDoc, targetEmail };
    };

    const result = tenantContext 
      ? await runWithTenantStorage(tenantContext, lookupUser).catch(() => null) 
      : await lookupUser();

    if (!result || !result.user) {
      return res.status(404).json({ message: 'No user account found matching the provided details.' });
    }

    const { user, targetEmail } = result;

    if (!targetEmail) {
      return res.status(400).json({ 
        message: 'This user account does not have a linked email address. Please contact your school administrator to reset your password.' 
      });
    }

    // Generate temporary password
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let tempPass = '';
    for (let i = 0; i < 8; i++) {
      tempPass += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashedPassword = await bcrypt.hash(tempPass, 10);

    // Save temporary password in primary database
    await runWithTenantStorage(null, async () => {
      await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
    });

    // Save temporary password in tenant database if it exists
    const resolvedTenantContext = user.institutionId ? resolveTenantStorageContext(user.institutionId) : null;
    if (resolvedTenantContext) {
      await runWithTenantStorage(resolvedTenantContext, async () => {
        await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
      });
    }

    // Send email with the temporary password
    const emailSubject = 'Temporary Password - EasySchool Password Recovery';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">EASY SCHOOL PASSWORD RECOVERY</h2>
        <p>Dear ${user.name},</p>
        <p>We received a request to recover the password for your account (Username: <strong>${user.username || user.email}</strong>).</p>
        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #64748b;">Your temporary password is:</p>
          <p style="margin: 5px 0 0 0; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #1e293b;">${tempPass}</p>
        </div>
        <p style="color: #ef4444; font-weight: bold;">Important Safety Notice:</p>
        <p>After logging in, please change this temporary password immediately from your profile settings.</p>
        <p>If you did not request this password recovery, you can ignore this email or contact your administrator.</p>
        <p style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          This is an automated message from the EasySchool System. Please do not reply directly to this email.
        </p>
      </div>
    `;

    const emailSent = await sendEmail({
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `Dear ${user.name},\n\nWe received a request to recover the password for your account.\n\nYour temporary password is: ${tempPass}\n\nPlease change this password immediately from your profile after logging in.\n\nBest regards,\nEasySchool Team`
    });

    if (!emailSent) {
      const emailEnabled = String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false' && isEmailConfigured();
      if (!emailEnabled) {
        const responsePayload: any = { 
          message: 'পাসওয়ার্ড পুনরুদ্ধার ইমেল সিস্টেমটি কনফিগার করা নেই বা বন্ধ আছে। আপনার অ্যাকাউন্ট পাসওয়ার্ড রিসেট করতে অনুগ্রহ করে স্কুল অ্যাডমিনের সাথে যোগাযোগ করুন। (Password recovery email service is not configured or disabled. Please contact your school administrator to reset your password.)' 
        };
        if (process.env.RETURN_TEMP_PASSWORD_ON_FAIL === 'true') {
          responsePayload.temporaryPassword = tempPass;
        }
        return res.status(503).json(responsePayload);
      }
      
      const responsePayload: any = { message: 'Failed to send recovery email. Please contact support or try again later.' };
      if (process.env.RETURN_TEMP_PASSWORD_ON_FAIL === 'true') {
        responsePayload.temporaryPassword = tempPass;
      }
      return res.status(500).json(responsePayload);
    }

    return res.json({ message: 'A temporary password has been sent to the email address linked to your account.' });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'An internal server error occurred while processing password recovery.', error: error?.message || String(error) });
  }
});

router.get('/check-users', async (_req, res) => {
  return res.json({ message: 'User check endpoint is available' });
});

export default router;
