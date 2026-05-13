import express from 'express';
import { register, login, getProfile, updateProfile, changePassword } from '../controllers/auth';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, forgotPasswordSchema, loginSchema, registerSchema } from '../validators/auth';
import User from '../models/User';
import bcrypt from 'bcryptjs';
import { sendEmail } from '../services/emailService';
import { randomBytes } from 'crypto';

const router = express.Router();

router.post('/register', validateBody(registerSchema), register);
router.post('/login', validateBody(loginSchema), login);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.put('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);
router.post('/change-password', authenticate, validateBody(changePasswordSchema), changePassword);

router.post('/forgot-password', validateBody(forgotPasswordSchema), async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const emailQuery = identifier.includes('@') ? identifier.toLowerCase() : identifier;

    const user = await User.findOne({
      $or: [
        { email: emailQuery },
        { username: emailQuery.toLowerCase() },
        { phone: identifier },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: 'No account found for the provided information' });
    }

    if (!user.email) {
      return res.status(400).json({ message: 'This account does not have an email address on file' });
    }

    const previousPassword = user.password;
    const temporaryPassword = `Reset@${randomBytes(6).toString('hex')}`;
    user.password = await bcrypt.hash(temporaryPassword, 10);
    await user.save();

    const subject = 'Your EASY SCHOOL password reset';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="margin: 0 0 16px; color: #0f172a;">Password reset request</h2>
        <p>Hello ${user.name || 'user'},</p>
        <p>Your password has been reset. Use the temporary password below to sign in, then change it immediately after login.</p>
        <div style="margin: 20px 0; padding: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
          <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">Temporary password</div>
          <div style="font-size: 18px; font-weight: 700; letter-spacing: 0.5px;">${temporaryPassword}</div>
        </div>
        <p style="font-size: 14px; color: #475569;">If you did not request this, contact your school administrator.</p>
      </div>
    `;

    const emailSent = await sendEmail({
      to: user.email,
      subject,
      html,
      text: `Your temporary password is: ${temporaryPassword}`,
    });

    if (!emailSent) {
      user.password = previousPassword;
      await user.save();
      return res.status(500).json({ message: 'Unable to send reset email. Please try again later.' });
    }

    res.json({
      message: 'Password reset instructions have been sent to your email address',
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process password reset request', error: String(error) });
  }
});

// Diagnostic endpoint - check if test users exist (public)
router.get('/check-users', async (req, res) => {
  try {
    const headUser = await User.findOne({ email: 'head@demoschool.edu' }).select('email name role isActive');
    const studentUser = await User.findOne({ email: 'student@demoschool.edu' }).select('email name role isActive');
    const teacherUser = await User.findOne({ email: 'teacher@demoschool.edu' }).select('email name role isActive');

    res.json({
      message: 'User check',
      testUsers: {
        head: headUser ? { exists: true, ...headUser.toObject() } : { exists: false },
        student: studentUser ? { exists: true, ...studentUser.toObject() } : { exists: false },
        teacher: teacherUser ? { exists: true, ...teacherUser.toObject() } : { exists: false },
      },
      seedDataExists: !!(headUser && studentUser && teacherUser),
    });
  } catch (error) {
    res.status(500).json({ error: String(error) });
  }
});

export default router;
