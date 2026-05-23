import express from 'express';
import { authenticate } from '../middleware/auth';
import Staff from '../models/Staff';
import User from '../models/User';
import IDCard from '../models/IDCard';
import { generatePassword, generateUsername, hashPassword } from '../utils/credentials';
import { buildCredentialSmsMessage, sendSMS } from '../utils/sms';

const router = express.Router();

const safeEmail = (username: string) => `${username}@staff.internal.local`;
const message = (error: any) => error?.name === 'ValidationError'
  ? Object.values(error.errors || {}).map((item: any) => item?.message).filter(Boolean).join(', ')
  : error?.code === 11000
    ? 'Duplicate staff record found. Please try again.'
    : error?.message || 'Staff API failed.';

async function syncStaffProfilesFromUsers(institutionId: any) {
  const users = await User.find({ institutionId, role: 'staff', isActive: { $ne: false } }).select('name phone avatar salary employeeId designation department createdAt').lean();
  const userIds = users.map((user: any) => user._id);
  const existing = await Staff.find({ institutionId, userId: { $in: userIds } }).select('userId').lean();
  const existingUserIds = new Set(existing.map((item: any) => String(item.userId)));
  const toCreate = users.filter((user: any) => !existingUserIds.has(String(user._id))).map((user: any, index: number) => ({
    userId: user._id,
    employeeId: user.employeeId || `S-${String(index + 1).padStart(3, '0')}-${String(user._id).slice(-4)}`,
    designation: user.designation || 'Staff',
    department: user.department || 'General',
    joiningDate: user.createdAt || new Date(),
    salary: Number(user.salary || 0),
    isActive: true,
    institutionId,
  }));
  if (toCreate.length) await Staff.insertMany(toCreate, { ordered: false }).catch(() => undefined);
}

async function createStaffUser(req: any) {
  const password = generatePassword();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const username = await generateUsername(req.body.name || 'Staff', 'staff');
    try {
      const user = await User.create({ name: String(req.body.name || 'Staff').trim() || 'Staff', username, email: safeEmail(username), password: await hashPassword(password), role: 'staff', phone: req.body.phone, avatar: req.body.photo, salary: Number(req.body.salary) || 0, employeeId: req.body.employeeId, designation: req.body.designation || 'Staff', department: req.body.department || 'General', institutionId: req.user.institutionId });
      return { user, username, password };
    } catch (error: any) {
      const key = Object.keys(error?.keyPattern || error?.keyValue || {})[0] || '';
      if (error?.code === 11000 && (key.includes('username') || key.includes('email'))) continue;
      throw error;
    }
  }
  const error: any = new Error('Could not generate unique staff username. Please try again.');
  error.statusCode = 409;
  throw error;
}

const sendStaffLoginSms = async (req: any, user: any, username: string, loginCode: string) => {
  const phone = String(req.body.phone || user.phone || '').trim();
  if (!phone) return false;
  try {
    return await sendSMS({ to: phone, message: buildCredentialSmsMessage({ summary: 'Staff account created', username, password: loginCode }), institutionId: req.user.institutionId, recipientName: user.name || 'Staff', recipientPhone: phone, type: 'notification' });
  } catch (error) {
    console.error('Staff login SMS failed:', error);
    return false;
  }
};

router.get('/', authenticate, async (req, res) => {
  try {
    await syncStaffProfilesFromUsers(req.user.institutionId);
    const staff = await Staff.find({ institutionId: req.user.institutionId, isActive: { $ne: false } }).populate('userId', 'name username email phone avatar').sort({ createdAt: -1 });
    res.json({ staff, syncedProfiles: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load staff', error });
  }
});

router.get('/:id', authenticate, (req, res) => {
  Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId }).populate('userId', 'name username email phone avatar')
    .then((staff) => { if (!staff) return res.status(404).json({ message: 'Staff not found' }); res.json({ staff }); })
    .catch((error) => res.status(500).json({ message: 'Failed to load staff', error }));
});

const createIdCard = async (staffId: any, req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `STAFF-${Date.now()}-${String(staffId).slice(-4)}`;
  return IDCard.create({ ownerId: staffId, ownerType: 'staff', cardNumber, cardType: 'standard', photoUrl, qrCodeData: cardNumber, barcodeData: cardNumber, validityStart: now, validityEnd, issuedBy: req.user._id, issuedAt: now, institutionId: req.user.institutionId });
};

router.post('/', authenticate, async (req, res) => {
  try {
    const { user, username, password } = await createStaffUser(req);
    const staff = await Staff.create({ userId: user._id, employeeId: req.body.employeeId || `S-${Date.now()}`, designation: req.body.designation || 'Staff', department: req.body.department || 'General', joiningDate: req.body.joiningDate || new Date(), salary: Number(req.body.salary) || 0, institutionId: req.user.institutionId });
    const idCard = req.body.autoIdCard !== false ? await createIdCard(staff._id, req, req.body.photo) : null;
    const smsSent = await sendStaffLoginSms(req, user, username, password);
    res.status(201).json({ staff, user, idCard, credentials: { username, password }, smsSent });
  } catch (error: any) {
    res.status(error?.statusCode || (error?.name === 'ValidationError' ? 400 : 500)).json({ message: message(error), error: { name: error?.name, message: error?.message, code: error?.code } });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const rawId = String(req.params.id || '');
    if (rawId.startsWith('user-')) {
      await syncStaffProfilesFromUsers(req.user.institutionId);
      const profile = await Staff.findOne({ userId: rawId.replace(/^user-/, ''), institutionId: req.user.institutionId });
      if (!profile) return res.status(404).json({ message: 'Staff profile not found for user' });
      req.params.id = String(profile._id);
    }
    const staff = await Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    await User.findByIdAndUpdate(staff.userId, { name: req.body.name, phone: req.body.phone, avatar: req.body.photo, salary: Number(req.body.salary) || 0, employeeId: req.body.employeeId, designation: req.body.designation || 'Staff', department: req.body.department || 'General' });
    staff.employeeId = req.body.employeeId || staff.employeeId;
    staff.designation = req.body.designation || staff.designation;
    staff.department = req.body.department || staff.department;
    staff.joiningDate = req.body.joiningDate || staff.joiningDate;
    staff.salary = Number(req.body.salary) || 0;
    await staff.save();
    const updated = await Staff.findById(staff._id).populate('userId', 'name username email phone avatar');
    res.json({ staff: updated });
  } catch (error: any) {
    res.status(error?.statusCode || 500).json({ message: message(error), error: { name: error?.name, message: error?.message } });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const rawId = String(req.params.id || '');
    if (rawId.startsWith('user-')) {
      await User.findOneAndUpdate({ _id: rawId.replace(/^user-/, ''), institutionId: req.user.institutionId, role: 'staff' }, { isActive: false });
      const profile = await Staff.findOne({ userId: rawId.replace(/^user-/, ''), institutionId: req.user.institutionId });
      if (profile) { profile.isActive = false; await profile.save(); }
      return res.json({ message: 'Staff deactivated' });
    }
    const staff = await Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    await User.findByIdAndUpdate(staff.userId, { isActive: false });
    staff.isActive = false;
    await staff.save();
    res.json({ message: 'Staff deactivated', staff });
  } catch (error: any) {
    res.status(500).json({ message: message(error), error });
  }
});

export default router;