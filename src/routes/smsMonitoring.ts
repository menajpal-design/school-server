import { Router, Request, Response } from 'express';
import { authenticate, authorize, normalizeRole } from '../middleware/auth';
import SmsLog from '../models/SmsLog';
import SmsPurchaseRequest from '../models/SmsPurchaseRequest';
import Parent from '../models/Parent';
import Institution from '../models/Institution';
import getTenantIdFromReq from '../utils/tenant';
import { sendSMS } from '../utils/sms';

const router = Router();
const smsUnitPrice = () => Number(process.env.SMS_UNIT_PRICE || process.env.DEFAULT_SMS_UNIT_PRICE || 0);
const roleOf = (req: any) => normalizeRole(req.user?.role) || req.user?.role;
const isSystemAdmin = (req: any) => ['admin', 'super_admin'].includes(roleOf(req));
const requestAllowed = (req: any) => ['head', 'admin', 'super_admin'].includes(roleOf(req));
const institutionFromReq = (req: any) => isSystemAdmin(req) && (req.body?.institutionId || req.query?.institutionId) ? String(req.body?.institutionId || req.query?.institutionId) : String(getTenantIdFromReq(req) || req.user?.institutionId || '');

// SMS DIAGNOSTIC — tells you exactly why SMS is failing
router.get('/sms-diagnostic', authenticate, authorize('admin', 'super_admin', 'head'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantIdFromReq(req);
    const institution = await Institution.findById(tenantId).select('settings billing name').lean();
    const settings: any = (institution as any)?.settings || {};
    const billing: any = (institution as any)?.billing || {};
    const globalEnabled = process.env.SMS_ENABLED !== 'false';
    const smsEnabled = typeof settings.smsEnabled === 'boolean' ? settings.smsEnabled : globalEnabled;
    const rawKey = String(settings.smsApiKey || process.env.SMS_API_KEY || process.env.ANONCIFY_SMS_API_KEY || '').trim();
    const isPlaceholder = !rawKey || rawKey.length < 8 || /your_|REPLACE|demo|test_key|placeholder|example/i.test(rawKey);
    const hasValidKey = !isPlaceholder;
    const provider = String(settings.smsProvider || process.env.SMS_PROVIDER || 'anoncify').toLowerCase();
    const apiUrl = String(settings.smsApiUrl || process.env.SMS_API_URL || 'https://anoncify.xyz/api/sms').trim();
    const smsBalance = Number(billing.smsBalance ?? 0);
    const hasCredits = smsBalance > 0;
    const recentLogs = await SmsLog.find({ institutionId: tenantId }).sort({ sentAt: -1 }).limit(10).lean();
    const failureReasons = recentLogs.filter((log: any) => log.status === 'failed').map((log: any) => log.failureReason || log.errorMessage).filter(Boolean);
    const uniqueFailures = [...new Set(failureReasons)];
    const diagnosis = {
      institutionName: (institution as any)?.name,
      smsEnabled,
      provider,
      apiUrl,
      hasValidKey,
      keySource: settings.smsApiKey ? 'institution_settings' : (process.env.SMS_API_KEY && !isPlaceholder) ? 'env_variable' : 'NONE',
      rawKeyMasked: rawKey ? `${rawKey.slice(0, 4)}${'*'.repeat(Math.max(rawKey.length - 4, 0))}` : '(empty)',
      smsBalance,
      hasCredits,
      recentLogCount: recentLogs.length,
      recentFailures: uniqueFailures,
      verdict: !smsEnabled ? '❌ SMS is DISABLED' : !hasValidKey ? '❌ NO VALID API KEY — set it via POST /institution/sms-settings' : provider !== 'anoncify' ? `❌ Unknown provider: ${provider}` : !hasCredits && smsBalance === 0 ? '✅ Config OK — SMS will work (no package needed, unlimited mode)' : '✅ SMS should be working',
      fix: !hasValidKey ? 'Call POST /institution/sms-settings with { "smsApiKey": "your-real-key" }' : undefined,
    };
    res.json({ diagnosis, recentLogs });
  } catch (error) {
    res.status(500).json({ message: 'Diagnostic failed', error });
  }
});

// GET SMS SETTINGS for this institution
router.get('/sms-settings', authenticate, authorize('admin', 'super_admin', 'head'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantIdFromReq(req);
    const institution = await Institution.findById(tenantId).select('settings').lean();
    const settings: any = (institution as any)?.settings || {};
    res.json({ smsEnabled: settings.smsEnabled ?? true, smsProvider: settings.smsProvider || 'anoncify', smsApiUrl: settings.smsApiUrl || 'https://anoncify.xyz/api/sms', smsApiKeyMasked: settings.smsApiKey ? `${String(settings.smsApiKey).slice(0, 4)}${'*'.repeat(Math.max(String(settings.smsApiKey).length - 4, 0))}` : '(not set)', smsApiKeySet: Boolean(settings.smsApiKey) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch SMS settings', error });
  }
});

// SAVE SMS SETTINGS
router.post('/sms-settings', authenticate, authorize('admin', 'super_admin', 'head'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantIdFromReq(req);
    const institution = await Institution.findById(tenantId);
    if (!institution) return res.status(404).json({ message: 'Institution not found' });
    const update: Record<string, any> = {};
    if (req.body.smsApiKey !== undefined) update['settings.smsApiKey'] = String(req.body.smsApiKey || '').trim();
    if (req.body.smsEnabled !== undefined) update['settings.smsEnabled'] = Boolean(req.body.smsEnabled);
    if (req.body.smsProvider !== undefined) update['settings.smsProvider'] = String(req.body.smsProvider || 'anoncify').toLowerCase();
    if (req.body.smsApiUrl !== undefined) update['settings.smsApiUrl'] = String(req.body.smsApiUrl || '').trim();
    if (!Object.keys(update).length) return res.status(400).json({ message: 'No SMS settings provided to update' });
    await Institution.findByIdAndUpdate(tenantId, { $set: update });
    res.json({ message: 'SMS settings saved successfully', updated: Object.keys(update) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to save SMS settings', error });
  }
});

// TEST SMS
router.post('/sms-test', authenticate, authorize('admin', 'super_admin', 'head'), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantIdFromReq(req);
    const phone = String(req.body?.phone || '').trim();
    if (!phone) return res.status(400).json({ message: 'phone number required in body' });
    const result = await sendSMS({ to: phone, message: 'EASY SCHOOL SMS test message. If you receive this, SMS is working correctly.', institutionId: tenantId, type: 'notification', purpose: 'sms_test', recipientName: 'Test', recipientPhone: phone });
    res.json({ sent: result, phone, message: result ? '✅ SMS sent successfully' : '❌ SMS failed — check /institution/sms-diagnostic' });
  } catch (error) {
    res.status(500).json({ message: 'SMS test failed', error });
  }
});

// SMS PURCHASE REQUESTS
router.get('/purchases', authenticate, async (req: any, res: Response) => {
  try {
    const role = roleOf(req);
    if (!['head', 'assistant_head', 'finance_officer', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Access denied.' });
    const institutionId = institutionFromReq(req);
    const filter: any = {};
    if (!isSystemAdmin(req) || institutionId) filter.institutionId = institutionId;
    const requests = await SmsPurchaseRequest.find(filter).populate('institutionId', 'name phone email').populate('requestedBy', 'name username phone role').populate('approvedBy', 'name username role').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ requests, unitPrice: smsUnitPrice(), total: requests.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load SMS purchase requests', error });
  }
});

router.post('/purchases', authenticate, async (req: any, res: Response) => {
  try {
    if (!requestAllowed(req)) return res.status(403).json({ message: 'Only Head/Admin can request SMS purchase.' });
    const institutionId = institutionFromReq(req);
    const quantity = Number(req.body.quantity || req.body.credits || 0);
    const contactNumber = String(req.body.contactNumber || req.body.phone || '').trim();
    if (!institutionId) return res.status(400).json({ message: 'Institution not found.' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ message: 'SMS quantity must be a positive number.' });
    if (!contactNumber) return res.status(400).json({ message: 'Contact phone number is required.' });
    const price = Number(req.body.unitPrice ?? smsUnitPrice());
    const request = await SmsPurchaseRequest.create({ institutionId, requestedBy: req.user?._id || req.user?.id, quantity, unitPrice: price, totalAmount: Number(req.body.totalAmount ?? quantity * price), contactNumber, paymentMethod: String(req.body.paymentMethod || 'manual'), notes: String(req.body.notes || ''), status: 'pending' });
    res.status(201).json({ message: 'SMS purchase request submitted successfully.', request });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create SMS purchase request', error });
  }
});

router.patch('/purchases/:id/status', authenticate, authorize('admin', 'super_admin'), async (req: any, res: Response) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['pending', 'approved', 'rejected', 'paid'].includes(status)) return res.status(400).json({ message: 'Invalid status.' });
    const request: any = await SmsPurchaseRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'SMS purchase request not found.' });
    request.status = status;
    request.approvedBy = req.user?._id || req.user?.id;
    request.approvedAt = status === 'pending' ? undefined : (request.approvedAt || new Date());
    request.paidAt = status === 'paid' ? (request.paidAt || new Date()) : request.paidAt;
    if ((status === 'approved' || status === 'paid') && !request.creditedAt) {
      const qty = Number(request.quantity || 0);
      await Institution.findByIdAndUpdate(request.institutionId, { $inc: { 'billing.smsBalance': qty, 'billing.monthlySmsLimit': qty } });
      request.creditedAt = new Date();
      request.creditedQuantity = qty;
    }
    await request.save();
    res.json({ message: `SMS purchase request marked as ${status}.`, request });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update SMS purchase status', error });
  }
});

// Get all SMS logs for an institution
router.get('/', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer', 'staff'), async (req: Request, res: Response) => {
  try {
    const { status, parentId, studentId, type, startDate, endDate } = req.query;
    const tenantId = getTenantIdFromReq(req);
    if (!tenantId) return res.status(400).json({ error: 'Institution not found' });
    const filter: any = { institutionId: tenantId };
    if (status) filter.status = status;
    if (parentId) filter.parentId = parentId;
    if (studentId) filter.studentId = studentId;
    if (type) filter.type = type;
    if (startDate || endDate) {
      filter.sentAt = {};
      if (startDate) filter.sentAt.$gte = new Date(startDate as string);
      if (endDate) filter.sentAt.$lte = new Date(endDate as string);
    }
    const smsLogs = await SmsLog.find(filter).populate('parentId', 'userId').populate('studentId', 'name').sort({ sentAt: -1 }).limit(500);
    const enrichedLogs = await Promise.all(smsLogs.map(async (log) => log.toObject()));
    res.json({ total: smsLogs.length, data: enrichedLogs });
  } catch (error) {
    console.error('Error fetching SMS logs:', error);
    res.status(500).json({ error: 'Failed to fetch SMS logs' });
  }
});

router.get('/parent/:parentId', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer', 'staff'), async (req: Request, res: Response) => {
  try {
    const { parentId } = req.params;
    const tenantId = getTenantIdFromReq(req);
    const parent = await Parent.findById(parentId);
    if (!parent) return res.status(404).json({ error: 'Parent not found' });
    const smsLogs = await SmsLog.find({ institutionId: tenantId, parentId }).populate('studentId', 'name').sort({ sentAt: -1 });
    const summaryByStatus = { sent: 0, failed: 0, delivered: 0, pending: 0 };
    smsLogs.forEach((log) => { summaryByStatus[log.status as keyof typeof summaryByStatus]++; });
    res.json({ parent: { id: parent._id, children: parent.children || [] }, summary: summaryByStatus, logs: smsLogs });
  } catch (error) {
    console.error('Error fetching parent SMS logs:', error);
    res.status(500).json({ error: 'Failed to fetch parent SMS logs' });
  }
});

router.get('/stats', authenticate, authorize('admin', 'super_admin', 'head', 'assistant_head', 'finance_officer'), async (req: Request, res: Response) => {
  try {
    const { days = 30 } = req.query;
    const tenantId = getTenantIdFromReq(req);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));
    const stats = await SmsLog.aggregate([{ $match: { institutionId: tenantId, sentAt: { $gte: startDate } } }, { $group: { _id: '$status', count: { $sum: 1 } } }]);
    const typeBreakdown = await SmsLog.aggregate([{ $match: { institutionId: tenantId, sentAt: { $gte: startDate } } }, { $group: { _id: '$type', count: { $sum: 1 } } }]);
    const totalSent = await SmsLog.countDocuments({ institutionId: tenantId, sentAt: { $gte: startDate } });
    res.json({ period: `Last ${days} days`, totalSent, statusBreakdown: stats, typeBreakdown });
  } catch (error) {
    console.error('Error fetching SMS stats:', error);
    res.status(500).json({ error: 'Failed to fetch SMS statistics' });
  }
});

export default router;
