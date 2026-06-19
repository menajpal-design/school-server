import express from 'express';
import mongoose from 'mongoose';
import { authenticate, canManageAcademic } from '../middleware/auth';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import User from '../models/User';

const router = express.Router();

const normalize = (value: any) => String(value || '').trim();
const canManageFingerprint = (role: string) => ['admin', 'super_admin', 'head', 'assistant_head'].includes(role);
const teacherRoles = ['teacher', 'class_teacher', 'subject_teacher'];
const toUserType = (role: string): 'teacher' | 'staff' => teacherRoles.includes(role) || ['head', 'assistant_head'].includes(role) ? 'teacher' : 'staff';

const safeId = (value: any) => mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : value;

async function findDuplicate(institutionId: any, fingerprintId: string, exclude?: { personType: string; personId: string }) {
  const [student, teacher, staff, user] = await Promise.all([
    Student.findOne({ institutionId, fingerprintId, ...(exclude?.personType === 'student' ? { _id: { $ne: safeId(exclude.personId) } } : {}) }).populate('userId', 'name role').lean(),
    Teacher.findOne({ institutionId, fingerprintId, ...(exclude?.personType === 'teacher' ? { _id: { $ne: safeId(exclude.personId) } } : {}) }).populate('userId', 'name role').lean(),
    Staff.findOne({ institutionId, fingerprintId, ...(exclude?.personType === 'staff' ? { _id: { $ne: safeId(exclude.personId) } } : {}) }).populate('userId', 'name role').lean(),
    User.findOne({ institutionId, fingerprintId, ...(exclude?.personType === 'user' ? { _id: { $ne: safeId(exclude.personId) } } : {}) }).lean(),
  ]);
  if (student) return { type: 'student', name: (student as any).userId?.name || 'Student' };
  if (teacher) return { type: 'teacher', name: (teacher as any).userId?.name || 'Teacher' };
  if (staff) return { type: 'staff', name: (staff as any).userId?.name || 'Staff' };
  if (user) return { type: 'user', name: (user as any).name || 'User' };
  return null;
}

router.get('/fingerprint/people', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    if (!canManageFingerprint(req.user.role)) return res.status(403).json({ message: 'Only Head, Assistant Head, Admin or Super Admin can manage fingerprints.' });
    const personType = normalize(req.query.personType || 'student').toLowerCase();

    if (personType === 'teacher') {
      const teachers = await Teacher.find({ institutionId: req.user.institutionId, isActive: true })
        .populate('userId', 'name avatar email role phone username fingerprintId biometricId')
        .select('userId employeeId department designation isActive fingerprintId biometricId')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: teachers.map((teacher: any) => ({ ...teacher, _id: teacher._id, personId: teacher._id, userIdValue: teacher.userId?._id || teacher.userId, personType: 'teacher', userType: 'teacher' })) });
    }

    if (personType === 'staff') {
      const staff = await Staff.find({ institutionId: req.user.institutionId, isActive: true })
        .populate('userId', 'name avatar email role phone username fingerprintId biometricId')
        .select('userId employeeId department designation isActive fingerprintId biometricId')
        .sort({ createdAt: -1 })
        .lean();
      return res.json({ people: staff.map((staffMember: any) => ({ ...staffMember, _id: staffMember._id, personId: staffMember._id, userIdValue: staffMember.userId?._id || staffMember.userId, personType: 'staff', userType: 'staff' })) });
    }

    if (personType === 'employees') {
      const [teachers, staff, heads] = await Promise.all([
        Teacher.find({ institutionId: req.user.institutionId, isActive: true }).populate('userId', 'name avatar email role phone username fingerprintId biometricId').select('userId employeeId department designation isActive fingerprintId biometricId').lean(),
        Staff.find({ institutionId: req.user.institutionId, isActive: true }).populate('userId', 'name avatar email role phone username fingerprintId biometricId').select('userId employeeId department designation isActive fingerprintId biometricId').lean(),
        User.find({ institutionId: req.user.institutionId, role: { $in: ['head', 'assistant_head'] }, isActive: true }).select('name avatar email role phone username fingerprintId biometricId').lean(),
      ]);
      return res.json({ people: [
        ...teachers.map((teacher: any) => ({ ...teacher, _id: teacher._id, personId: teacher._id, userIdValue: teacher.userId?._id || teacher.userId, personType: 'teacher', userType: 'teacher' })),
        ...staff.map((staffMember: any) => ({ ...staffMember, _id: staffMember._id, personId: staffMember._id, userIdValue: staffMember.userId?._id || staffMember.userId, personType: 'staff', userType: 'staff' })),
        ...heads.map((user: any) => ({ ...user, _id: user._id, personId: user._id, userIdValue: user._id, personType: 'user', userType: toUserType(user.role) })),
      ] });
    }

    const students = await Student.find({ institutionId: req.user.institutionId, isActive: true })
      .populate('userId', 'name avatar email role phone username fingerprintId biometricId')
      .populate('classId', 'name grade')
      .populate('sectionId', 'name')
      .select('userId rollNumber idCardNumber classId sectionId isActive fingerprintId biometricId')
      .sort({ rollNumber: 1 })
      .lean();
    return res.json({ people: students.map((student: any) => ({ ...student, _id: student._id, personId: student._id, userIdValue: student.userId?._id || student.userId, personType: 'student', userType: 'student' })) });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load fingerprint people', error });
  }
});

router.post('/fingerprint/register', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    if (!canManageFingerprint(req.user.role)) return res.status(403).json({ message: 'Only Head, Assistant Head, Admin or Super Admin can add fingerprints.' });
    const personType = normalize(req.body.personType).toLowerCase();
    const personId = normalize(req.body.personId);
    const fingerprintId = normalize(req.body.fingerprintId || req.body.biometricId);
    if (!personId || !personType || !fingerprintId) return res.status(400).json({ message: 'personType, personId and fingerprintId are required.' });

    const duplicate = await findDuplicate(req.user.institutionId, fingerprintId, { personType, personId });
    if (duplicate) return res.status(409).json({ message: `Fingerprint already registered for ${duplicate.name} (${duplicate.type}).` });

    let updated: any = null;
    let userId: any = null;

    if (personType === 'student') {
      updated = await Student.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { fingerprintId, biometricId: fingerprintId }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'teacher') {
      updated = await Teacher.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { fingerprintId, biometricId: fingerprintId }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'staff') {
      updated = await Staff.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { fingerprintId, biometricId: fingerprintId }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'user') {
      updated = await User.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { fingerprintId, biometricId: fingerprintId }, { new: true }).select('name role fingerprintId biometricId');
      userId = updated?._id;
    } else {
      return res.status(400).json({ message: 'Invalid personType.' });
    }

    if (!updated) return res.status(404).json({ message: 'Person not found.' });
    if (userId) await User.findOneAndUpdate({ _id: userId, institutionId: req.user.institutionId }, { fingerprintId, biometricId: fingerprintId });
    return res.json({ message: 'Fingerprint registered successfully.', person: updated });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to register fingerprint', error });
  }
});

router.delete('/fingerprint/:personType/:personId', authenticate, canManageAcademic(), async (req: any, res) => {
  try {
    if (!canManageFingerprint(req.user.role)) return res.status(403).json({ message: 'Only Head, Assistant Head, Admin or Super Admin can remove fingerprints.' });
    const personType = normalize(req.params.personType).toLowerCase();
    const personId = normalize(req.params.personId);
    let updated: any = null;
    let userId: any = null;

    if (personType === 'student') {
      updated = await Student.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { $unset: { fingerprintId: '', biometricId: '' } }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'teacher') {
      updated = await Teacher.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { $unset: { fingerprintId: '', biometricId: '' } }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'staff') {
      updated = await Staff.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { $unset: { fingerprintId: '', biometricId: '' } }, { new: true }).populate('userId', 'name role');
      userId = updated?.userId?._id || updated?.userId;
    } else if (personType === 'user') {
      updated = await User.findOneAndUpdate({ _id: safeId(personId), institutionId: req.user.institutionId }, { $unset: { fingerprintId: '', biometricId: '' } }, { new: true }).select('name role');
      userId = updated?._id;
    } else {
      return res.status(400).json({ message: 'Invalid personType.' });
    }

    if (!updated) return res.status(404).json({ message: 'Person not found.' });
    if (userId) await User.findOneAndUpdate({ _id: userId, institutionId: req.user.institutionId }, { $unset: { fingerprintId: '', biometricId: '' } });
    return res.json({ message: 'Fingerprint removed successfully.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to remove fingerprint', error });
  }
});

export default router;
