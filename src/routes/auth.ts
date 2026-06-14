import express from 'express';
import bcrypt from 'bcryptjs';
import { register, login, updateProfile, changePassword, logout, refreshToken } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth';
import Institution from '../models/Institution';
import User from '../models/User';
import Student from '../models/Student';
import { runWithTenantStorage, resolveTenantStorageContext } from '../config/tenantStorage';
import { sendEmail } from '../utils/email';
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

    // Look up user directly first
    let user = await User.findOne({ 
      $or: [
        { email: emailQuery }, 
        { username: emailQuery }, 
        { phone: identifier }
      ] 
    }).populate('institutionId');

    // If not found, check if it's a student roll or guardian identifier
    if (!user) {
      const student = await Student.findOne({ 
        $or: [
          { rollNumber: identifier }, 
          { guardianPhone: identifier }, 
          { guardianEmail: emailQuery }
        ] 
      }).select('userId').lean();

      if (student?.userId) {
        user = await User.findOne({ _id: student.userId, role: 'student' }).populate('institutionId');
      }
    }

    if (!user) {
      return res.status(404).json({ message: 'No user account found matching the provided details.' });
    }

    // Determine the email to send to
    let targetEmail = user.email;
    if (!targetEmail && user.role === 'student') {
      const student = await Student.findOne({ userId: user._id }).select('guardianEmail').lean();
      targetEmail = student?.guardianEmail;
    }

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
    user.password = hashedPassword;
    await user.save();

    // Sync to tenant storage if configured
    const tenantInstitution = await Institution.findById(user.institutionId).lean().catch(() => null);
    const tenantContext = tenantInstitution ? resolveTenantStorageContext(tenantInstitution) : null;
    if (tenantContext) {
      await runWithTenantStorage(tenantContext, async () => {
        await User.updateOne({ _id: user._id }, { $set: { password: hashedPassword } });
      }).catch((err) => console.warn('Tenant password sync failed:', err?.message || err));
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
      return res.status(500).json({ message: 'Failed to send recovery email. Please contact support or try again later.' });
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
