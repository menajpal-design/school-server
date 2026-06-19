import express from 'express';
import { authenticate, authorize, normalizeRole } from '../middleware/auth';
import SmsPurchaseRequest from '../models/SmsPurchaseRequest';
import Institution from '../models/Institution';
import getTenantIdFromReq from '../utils/tenant';

const router = express.Router();
const unitPrice = () => Number(process.env.SMS_UNIT_PRICE || process.env.DEFAULT_SMS_UNIT_PRICE || 0);
const roleOf = (req: any) => normalizeRole(req.user?.role) || req.user?.role;
const isAdmin = (req: any) => ['admin', 'super_admin'].includes(roleOf(req));
const institutionOf = (req: any) => isAdmin(req) && (req.body?.institutionId || req.query?.institutionId) ? String(req.body?.institutionId || req.query?.institutionId) : String(getTenantIdFromReq(req) || req.user?.institutionId || '');
const canRequest = (req: any) => ['head', 'admin', 'super_admin'].includes(roleOf(req));

router.get('/', authenticate, async (req: any, res) => {
  try {
    const role = roleOf(req);
    if (!['head', 'assistant_head', 'finance_officer', 'admin', 'super_admin'].includes(role)) return res.status(403).json({ message: 'Access denied.' });
    const institutionId = institutionOf(req);
    const filter: any = {};
    if (!isAdmin(req) || institutionId) filter.institutionId = institutionId;
    const requests = await SmsPurchaseRequest.find(filter).populate('institutionId', 'name phone email').populate('requestedBy', 'name username phone role').populate('approvedBy', 'name username role').sort({ createdAt: -1 }).limit(100).lean();
    res.json({ requests, unitPrice: unitPrice(), total: requests.length });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load SMS purchase requests', error });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canRequest(req)) return res.status(403).json({ message: 'Only Head/Admin can request SMS purchase.' });
    const institutionId = institutionOf(req);
    const quantity = Number(req.body.quantity || req.body.credits || 0);
    const contactNumber = String(req.body.contactNumber || req.body.phone || '').trim();
    if (!institutionId) return res.status(400).json({ message: 'Institution not found.' });
    if (!Number.isFinite(quantity) || quantity <= 0) return res.status(400).json({ message: 'SMS quantity must be a positive number.' });
    if (!contactNumber) return res.status(400).json({ message: 'Contact phone number is required.' });
    const price = Number(req.body.unitPrice ?? unitPrice());
    const request = await SmsPurchaseRequest.create({ institutionId, requestedBy: req.user?._id || req.user?.id, quantity, unitPrice: price, totalAmount: Number(req.body.totalAmount ?? quantity * price), contactNumber, paymentMethod: String(req.body.paymentMethod || 'manual'), notes: String(req.body.notes || ''), status: 'pending' });
    res.status(201).json({ message: 'SMS purchase request submitted successfully.', request });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create SMS purchase request', error });
  }
});

router.patch('/:id/status', authenticate, authorize('admin', 'super_admin'), async (req: any, res) => {
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
      // Purchased SMS go to smsBalance + extraSmsCredits only (extraSmsCredits survives renewal).
      // monthlySmsLimit must stay tied to the plan, otherwise activateBilling double-counts it.
      await Institution.findByIdAndUpdate(request.institutionId, { $inc: { 'billing.smsBalance': qty, 'billing.extraSmsCredits': qty } });
      request.creditedAt = new Date();
      request.creditedQuantity = qty;
    }
    await request.save();
    res.json({ message: `SMS purchase request marked as ${status}.`, request });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update SMS purchase status', error });
  }
});

export default router;
