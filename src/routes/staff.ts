import express from 'express';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/auth';
import Staff from '../models/Staff';
import User from '../models/User';
import IDCard from '../models/IDCard';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Staff.find({ institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .sort({ createdAt: -1 })
    .then((staff) => res.json({ staff }))
    .catch((error) => res.status(500).json({ message: 'Failed to load staff', error }));
});

router.get('/:id', authenticate, (req, res) => {
  Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('userId', 'name email phone avatar')
    .then((staff) => {
      if (!staff) return res.status(404).json({ message: 'Staff not found' });
      res.json({ staff });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load staff', error }));
});

const createIdCard = async (staffId: any, req: any, photoUrl?: string) => {
  const now = new Date();
  const validityEnd = new Date(now);
  validityEnd.setFullYear(now.getFullYear() + 1);
  const cardNumber = `STAFF-${Date.now()}-${String(staffId).slice(-4)}`;
  return IDCard.create({
    ownerId: staffId,
    ownerType: 'staff',
    cardNumber,
    cardType: 'standard',
    photoUrl,
    qrCodeData: cardNumber,
    barcodeData: cardNumber,
    validityStart: now,
    validityEnd,
    issuedBy: req.user._id,
    issuedAt: now,
    institutionId: req.user.institutionId,
  });
};

router.post('/', authenticate, async (req, res) => {
  try {
    const email = String(req.body.email || `${String(req.body.employeeId || Date.now()).toLowerCase()}@staff.local`);
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'A user with this email already exists' });

    const user = await User.create({
      name: req.body.name,
      email,
      password: await bcrypt.hash(String(req.body.password || 'Staff@123'), 10),
      role: 'staff',
      phone: req.body.phone,
      avatar: req.body.photo,
      institutionId: req.user.institutionId,
    });

    const staff = await Staff.create({
      userId: user._id,
      employeeId: req.body.employeeId || `S-${Date.now()}`,
      designation: req.body.designation,
      department: req.body.department,
      joiningDate: req.body.joiningDate || new Date(),
      salary: Number(req.body.salary) || 0,
      institutionId: req.user.institutionId,
    });

    const idCard = req.body.autoIdCard !== false ? await createIdCard(staff._id, req, req.body.photo) : null;
    res.status(201).json({ staff, user, idCard });
  } catch (error) {
    res.status(500).json({ message: 'Failed to create staff', error });
  }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });

    await User.findByIdAndUpdate(staff.userId, {
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      avatar: req.body.photo,
    });

    staff.employeeId = req.body.employeeId || staff.employeeId;
    staff.designation = req.body.designation;
    staff.department = req.body.department;
    staff.joiningDate = req.body.joiningDate;
    staff.salary = Number(req.body.salary) || 0;
    await staff.save();

    res.json({ staff });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update staff', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const staff = await Staff.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!staff) return res.status(404).json({ message: 'Staff not found' });
    await User.findByIdAndUpdate(staff.userId, { isActive: false });
    staff.isActive = false;
    await staff.save();
    res.json({ message: 'Staff deactivated', staff });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete staff', error });
  }
});

export default router;
