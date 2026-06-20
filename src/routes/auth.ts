import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { register, login, updateProfile, changePassword, logout, refreshToken } from '../controllers/auth';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../validators/common';
import { changePasswordSchema, loginSchema, registerSchema } from '../validators/auth';
import Institution from '../models/Institution';
import User from '../models/User';
import Student from '../models/Student';
import { runWithTenantStorage, resolveTenantStorageContext } from '../config/tenantStorage';
import { sendEmailDetail, isEmailConfigured } from '../utils/email';
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

    // Generate 6-digit random code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

    // Save temporary code in primary database
    await runWithTenantStorage(null, async () => {
      await User.updateOne({ _id: user._id }, { $set: { resetPasswordCode: resetCode, resetPasswordExpires: codeExpires } });
    });

    // Save temporary code in tenant database if it exists
    const resolvedTenantContext = user.institutionId ? resolveTenantStorageContext(user.institutionId) : null;
    if (resolvedTenantContext) {
      await runWithTenantStorage(resolvedTenantContext, async () => {
        await User.updateOne({ _id: user._id }, { $set: { resetPasswordCode: resetCode, resetPasswordExpires: codeExpires } });
      });
    }

    // Send email with the verification code
    const emailSubject = 'Verification Code - EasySchool Password Recovery';
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">EASY SCHOOL PASSWORD RECOVERY</h2>
        <p>Dear ${user.name},</p>
        <p>We received a request to recover the password for your account (Username: <strong>${user.username || user.email}</strong>).</p>
        <div style="background-color: #f8fafc; border-left: 4px solid #4f46e5; padding: 15px; margin: 20px 0; border-radius: 4px;">
          <p style="margin: 0; font-size: 14px; color: #64748b;">Your 6-digit verification code is:</p>
          <p style="margin: 5px 0 0 0; font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1e293b; text-align: center;">${resetCode}</p>
        </div>
        <p>This code is valid for 15 minutes. Please do not share this code with anyone.</p>
        <p style="color: #ef4444; font-weight: bold;">Important Safety Notice:</p>
        <p>If you did not request this password recovery, you can ignore this email safely.</p>
        <p style="margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px; font-size: 12px; color: #64748b;">
          This is an automated message from the EasySchool System. Please do not reply directly to this email.
        </p>
      </div>
    `;

    const emailResult = await sendEmailDetail({
      to: targetEmail,
      subject: emailSubject,
      html: emailHtml,
      text: `Dear ${user.name},\n\nWe received a request to recover the password for your account.\n\nYour verification code is: ${resetCode}\n\nThis code is valid for 15 minutes.\n\nBest regards,\nEasySchool Team`
    });

    if (!emailResult.success) {
      // Log full error on server for diagnostics
      console.error(`❌ Forgot-password email failed for "${targetEmail}":`, emailResult.error);
      return res.status(500).json({ 
        message: `Failed to send recovery email. Please contact your administrator.`,
        reason:  emailResult.error || 'Email provider error — check server logs for details',
        hint:    'Common causes: server IP blocked by Brevo, invalid API key, unverified sender address, or Droplet firewall blocking outbound HTTPS.',
      });
    }

    return res.json({ message: 'A verification code has been sent to the email address linked to your account.' });
  } catch (error: any) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ message: 'An internal server error occurred while processing password recovery.', error: error?.message || String(error) });
  }
});

router.post('/reset-password-with-code', async (req, res) => {
  try {
    const identifier = String(req.body.identifier || '').trim();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '').trim();

    if (!identifier || !code || !newPassword) {
      return res.status(400).json({ message: 'Email/username/phone, verification code, and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const emailQuery = identifier.toLowerCase();

    // ── MULTI-TENANT CONTEXT RESOLUTION ──────────────────────────────
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
    
    const headerInstId = req.headers['x-institution-id'] || req.body.institutionId || req.query.institutionId;
    if (!tenantInstitution && headerInstId && mongoose.Types.ObjectId.isValid(String(headerInstId))) {
      tenantInstitution = await Institution.findById(headerInstId).lean().catch(() => null);
    }

    const tenantContext = tenantInstitution ? resolveTenantStorageContext(tenantInstitution) : null;

    // ── LOOKUP USER INSIDE CONTEXT ─────────────────────────────
    const lookupUser = async () => {
      let userDoc = await User.findOne({ 
        $or: [
          { email: emailQuery }, 
          { username: emailQuery }, 
          { phone: identifier }
        ] 
      }).populate('institutionId');

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
      return userDoc;
    };

    const user = tenantContext 
      ? await runWithTenantStorage(tenantContext, lookupUser).catch(() => null) 
      : await lookupUser();

    if (!user) {
      return res.status(404).json({ message: 'No user account found matching the provided details.' });
    }

    // Verify verification code and expiration
    const dbCode = user.resetPasswordCode;
    const dbExpires = user.resetPasswordExpires;

    if (!dbCode || dbCode !== code) {
      return res.status(400).json({ message: 'Invalid verification code.' });
    }

    if (!dbExpires || new Date(dbExpires).getTime() < Date.now()) {
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Save new password and clear code in primary database
    await runWithTenantStorage(null, async () => {
      await User.updateOne(
        { _id: user._id }, 
        { 
          $set: { password: hashedPassword },
          $unset: { resetPasswordCode: 1, resetPasswordExpires: 1 } 
        }
      );
    });

    // Save new password and clear code in tenant database if it exists
    const resolvedTenantContext = user.institutionId ? resolveTenantStorageContext(user.institutionId) : null;
    if (resolvedTenantContext) {
      await runWithTenantStorage(resolvedTenantContext, async () => {
        await User.updateOne(
          { _id: user._id }, 
          { 
            $set: { password: hashedPassword },
            $unset: { resetPasswordCode: 1, resetPasswordExpires: 1 } 
          }
        );
      });
    }

    return res.json({ message: 'Your password has been reset successfully. You can now login with your new password.' });
  } catch (error: any) {
    console.error('Reset password code error:', error);
    return res.status(500).json({ message: 'An internal server error occurred while resetting your password.', error: error?.message || String(error) });
  }
});

router.get('/check-users', async (_req, res) => {
  return res.json({ message: 'User check endpoint is available' });
});

router.get('/email-diagnostic', authenticate, authorize('admin', 'super_admin'), async (_req, res) => {
  try {
    const brevoApiKey  = (process.env.BREVO_API_KEY || '').trim();
    const emailFrom    = (process.env.EMAIL_FROM || process.env.BREVO_FROM_EMAIL || '').trim();
    const emailEnabled = String(process.env.EMAIL_ENABLED || '').toLowerCase() !== 'false';
    const fromName     = process.env.BREVO_FROM_NAME || 'EasySchool';

    const mask = (str: string) => {
      if (!str) return '❌ not_configured';
      if (str.length <= 6) return '****';
      return `${str.substring(0, 4)}...${str.substring(str.length - 4)}`;
    };

    const envInfo = {
      EMAIL_ENABLED:   emailEnabled,
      BREVO_API_KEY:   mask(brevoApiKey),
      BREVO_FROM_NAME: fromName,
      EMAIL_FROM:      emailFrom || '❌ not_configured',
    };

    const checks: Record<string, any> = {};
    const issues: string[] = [];

    // ── Check 1: Environment Variables ──────────────────────────────────────
    checks.env = { ok: true, details: {} };
    if (!brevoApiKey) {
      checks.env.ok = false;
      checks.env.details.BREVO_API_KEY = '❌ Missing — add BREVO_API_KEY to .env and restart server';
      issues.push('BREVO_API_KEY is not set in environment variables');
    } else {
      checks.env.details.BREVO_API_KEY = '✅ Present';
    }
    if (!emailFrom) {
      checks.env.ok = false;
      checks.env.details.EMAIL_FROM = '❌ Missing — add EMAIL_FROM=verified@yourdomain.com to .env';
      issues.push('EMAIL_FROM sender address is not configured');
    } else {
      checks.env.details.EMAIL_FROM = `✅ ${emailFrom}`;
    }
    if (!emailEnabled) {
      checks.env.details.EMAIL_ENABLED = '⚠️ Set to false — emails will be skipped';
      issues.push('EMAIL_ENABLED is set to false — email sending is disabled');
    } else {
      checks.env.details.EMAIL_ENABLED = '✅ true';
    }

    // ── Check 2: Network Connectivity to Brevo ──────────────────────────────
    checks.network = { ok: false, details: '' };
    if (brevoApiKey) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        let networkRes: Response | null = null;
        try {
          networkRes = await fetch('https://api.brevo.com/v3/account', {
            method: 'GET',
            headers: { 'api-key': brevoApiKey, 'accept': 'application/json' },
            signal: ctrl.signal,
          });
        } finally { clearTimeout(t); }

        const status = networkRes!.status;
        const body   = await networkRes!.text().catch(() => networkRes!.statusText);

        if (networkRes!.ok) {
          checks.network.ok = true;
          checks.network.details = '✅ Successfully reached api.brevo.com';
          // ── Check 3: API Key validity (derived from same request) ─────────
          checks.apiKey = { ok: true, details: '✅ API key is valid and authenticated' };
          let accountInfo: any = null;
          try { accountInfo = JSON.parse(body); } catch {}
          if (accountInfo) {
            checks.apiKey.accountEmail  = accountInfo.email || 'unknown';
            checks.apiKey.companyName   = accountInfo.companyName || 'unknown';
            checks.apiKey.plan          = accountInfo.plan?.[0]?.type || 'unknown';
          }
        } else if (status === 401) {
          checks.network.ok = true;
          checks.network.details = '✅ Reached api.brevo.com (HTTP reachable)';
          checks.apiKey = {
            ok: false,
            details: `❌ API key rejected (401 Unauthorized). The key starting with "${brevoApiKey.slice(0, 12)}..." is invalid or revoked. Generate a new key at https://app.brevo.com/settings/keys/api`,
          };
          issues.push('Brevo API key is invalid or revoked (401)');
        } else if (status === 403) {
          checks.network.ok = true;
          checks.network.details = '✅ Reached api.brevo.com';
          checks.apiKey = {
            ok: false,
            details: `❌ Forbidden (403). Brevo account may be suspended or the key lacks permission. Details: ${body.slice(0, 200)}`,
          };
          issues.push('Brevo account forbidden (403) — may be suspended');
        } else {
          checks.network.ok = true;
          checks.network.details = `⚠️ Reached api.brevo.com but got HTTP ${status}`;
          checks.apiKey = { ok: false, details: `Unexpected response ${status}: ${body.slice(0, 200)}` };
          issues.push(`Unexpected Brevo response: HTTP ${status}`);
        }
      } catch (netErr: any) {
        const errMsg = String(netErr?.message || netErr).toLowerCase();
        let networkDiag = '';
        if (errMsg.includes('abort') || errMsg.includes('signal')) {
          networkDiag = '❌ Request to api.brevo.com timed out (8 s). ' +
            'This strongly suggests the outbound IP of this Droplet/server is BLOCKED by Brevo, ' +
            'or outbound HTTPS (port 443) is firewalled. ' +
            'Fix: whitelist the server IP in Brevo, or check Droplet firewall rules.';
          issues.push('Timeout reaching api.brevo.com — server IP may be blocked by Brevo or Droplet firewall blocks port 443');
        } else if (errMsg.includes('enotfound') || errMsg.includes('getaddrinfo')) {
          networkDiag = '❌ DNS resolution failed for api.brevo.com. ' +
            'The server cannot resolve this hostname. Check DNS on the Droplet (/etc/resolv.conf).';
          issues.push('DNS failure: cannot resolve api.brevo.com');
        } else if (errMsg.includes('econnrefused')) {
          networkDiag = '❌ Connection refused to api.brevo.com:443. ' +
            'Outbound HTTPS port 443 may be blocked by the Droplet firewall (ufw/iptables).';
          issues.push('Connection refused to api.brevo.com — check Droplet outbound firewall');
        } else if (errMsg.includes('econnreset') || errMsg.includes('socket hang up')) {
          networkDiag = '❌ Connection reset by Brevo. The server IP may be blacklisted by Brevo. ' +
            'Contact Brevo support to whitelist your Droplet IP.';
          issues.push('Connection reset — server IP may be blacklisted by Brevo');
        } else {
          networkDiag = `❌ Network error: ${errMsg}. Check Droplet connectivity and firewall.`;
          issues.push(`Network error reaching Brevo: ${errMsg}`);
        }
        checks.network.details = networkDiag;
        checks.apiKey = { ok: false, details: 'Cannot verify — network unreachable' };
      }
    } else {
      checks.network = { ok: false, details: '⏭️ Skipped — BREVO_API_KEY not set' };
      checks.apiKey  = { ok: false, details: '⏭️ Skipped — BREVO_API_KEY not set' };
    }

    // ── Check 4: Sender address verification hint ────────────────────────────
    checks.sender = {
      ok: Boolean(emailFrom),
      configured: emailFrom,
      details: emailFrom
        ? `✅ Sender set to "${emailFrom}" — ensure this address is a verified sender in Brevo (https://app.brevo.com/senders)`
        : '❌ No sender email configured (EMAIL_FROM / BREVO_FROM_EMAIL missing)',
    };
    if (!emailFrom) issues.push('Sender email (EMAIL_FROM) is not configured');

    // ── Summary ──────────────────────────────────────────────────────────────
    const allOk = checks.env.ok && checks.network.ok && checks.apiKey?.ok && checks.sender.ok && emailEnabled;
    const rootCause = issues.length
      ? issues.map((i, n) => `${n + 1}. ${i}`).join('\n')
      : null;

    return res.json({
      success: allOk,
      summary: allOk
        ? '✅ Email system is fully configured and operational'
        : `❌ Email issues detected:\n${rootCause}`,
      provider: 'Brevo (Sendinblue) HTTP API',
      checks,
      envInfo,
      ...(issues.length ? { issues } : {}),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: `Diagnostic failed: ${error?.message || String(error)}`,
    });
  }
});


export default router;
