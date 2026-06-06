import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import moment from 'moment';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import IDCard from '../models/IDCard';
import Parent from '../models/Parent';
import { sendEmail } from '../utils/email';
import { normalizeRole } from '../middleware/auth';

type OwnerType = 'student' | 'teacher' | 'staff' | 'head';

const YEAR = () => new Date().getFullYear();
const unique = (values: any[]) => Array.from(new Set(values.filter(Boolean).map((value) => String(value))));

function sanitizeFilename(value: string) {
  return String(value || 'card').trim().replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'card';
}

async function generateCardNumber(ownerType: string, institutionId: any) {
  const prefix = ownerType === 'student' ? 'STU' : ownerType === 'teacher' ? 'TCH' : ownerType === 'head' ? 'HEAD' : 'STF';
  const year = YEAR();
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year}-12-31T23:59:59Z`);
  const count = await IDCard.countDocuments({ ownerType, institutionId, issuedAt: { $gte: start, $lte: end } });
  return `${prefix}-${year}-${String((count || 0) + 1).padStart(6, '0')}`;
}

async function createBasicPdf(payload: any): Promise<Buffer> {
  return await new Promise<Buffer>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.fontSize(18).text(payload.institutionName || 'Educational Institution', { align: 'center' });
      doc.moveDown();
      doc.fontSize(15).text(payload.title || 'ID Card', { align: 'center' });
      doc.moveDown(2);
      doc.fontSize(12);
      doc.text(`Name: ${payload.name || ''}`);
      doc.text(`Role: ${payload.role || payload.ownerType || ''}`);
      doc.text(`Card Number: ${payload.cardNumber || payload.idNumber || ''}`);
      if (payload.className) doc.text(`Class: ${payload.className}`);
      if (payload.sectionName) doc.text(`Section: ${payload.sectionName}`);
      if (payload.rollNumber) doc.text(`Roll: ${payload.rollNumber}`);
      if (payload.designation) doc.text(`Designation: ${payload.designation}`);
      if (payload.validityStart || payload.validityEnd) doc.text(`Valid: ${payload.validityStart || ''} to ${payload.validityEnd || ''}`);
      if (payload.qrCodeData) {
        const qr = await QRCode.toDataURL(payload.qrCodeData, { width: 120, margin: 1 });
        const qrBuffer = Buffer.from(qr.split(',')[1], 'base64');
        doc.image(qrBuffer, 430, 180, { width: 100 });
      }
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

async function getOwner(ownerType: OwnerType, ownerId: any, institutionId: any) {
  if (ownerType === 'teacher' || ownerType === 'head') return Teacher.findOne({ _id: ownerId, institutionId }).populate('userId').populate('institutionId');
  if (ownerType === 'staff') return Staff.findOne({ _id: ownerId, institutionId }).populate('userId').populate('institutionId');
  return Student.findOne({ _id: ownerId, institutionId }).populate('userId').populate('classId').populate('sectionId').populate('institutionId');
}

async function createCardForOwner(ownerType: OwnerType, owner: any, issuedBy: any) {
  const institution = owner.institutionId as any;
  const cardNumber = await generateCardNumber(ownerType, institution._id || institution);
  const now = new Date();
  const validityEnd = moment(now).add(1, 'year').toDate();
  return IDCard.create({ ownerId: owner.userId?._id || owner.userId, ownerType, cardNumber, cardType: ownerType, photoUrl: owner.userId?.avatar || '', qrCodeData: `easy_school://idcard/${cardNumber}`, barcodeData: cardNumber, validityStart: now, validityEnd, status: 'active', issuedBy, issuedAt: now, institutionId: institution._id || institution, downloadCount: 0 });
}

function canReadCard(req: any, card: any) {
  const role = req.user?.role;
  if (['admin', 'super_admin', 'head', 'assistant_head', 'staff', 'finance_officer', 'class_teacher', 'subject_teacher', 'teacher'].includes(role)) return true;
  return String(card.ownerId?._id || card.ownerId) === String(req.user?._id || req.user?.id);
}

async function findStudentCard(student: any, user: any) {
  const studentUserId = student?.userId?._id || student?.userId;
  const ownerIds = unique([user?._id, user?.id, studentUserId, student?._id]);
  const possibleCardNumbers = unique([student?.idCardNumber, student?.rollNumber, user?.username, student?.admissionNumber, student?.registrationNumber]);
  const clauses: any[] = [{ ownerId: { $in: ownerIds } }];
  if (possibleCardNumbers.length) clauses.push({ cardNumber: { $in: possibleCardNumbers } }, { barcodeData: { $in: possibleCardNumbers } });
  return IDCard.findOne({ institutionId: user.institutionId, ownerType: 'student', $or: clauses }).populate('ownerId').populate('institutionId').sort({ createdAt: -1 });
}

async function resolveStudentProfileForUser(user: any) {
  const userIds = unique([user?._id, user?.id]);
  const lookupValues = unique([user?.username]);
  const clauses: any[] = [{ userId: { $in: userIds } }];
  if (lookupValues.length) clauses.push({ rollNumber: { $in: lookupValues } }, { idCardNumber: { $in: lookupValues } });
  return Student.findOne({ institutionId: user.institutionId, $or: clauses }).populate('userId').populate('classId').populate('sectionId').populate('institutionId');
}

export const generateStudentIdCard = async (req: Request, res: Response) => { try { const student = await Student.findOne({ _id: req.params.studentId, institutionId: (req as any).user?.institutionId }).populate('userId').populate('classId').populate('sectionId').populate('institutionId'); if (!student) return res.status(404).json({ message: 'Student not found' }); const card = await createCardForOwner('student', student, (req as any).user?._id || (req as any).user?.id); const pdf = await createBasicPdf({ title: 'Student ID Card', institutionName: (student.institutionId as any)?.name, name: (student.userId as any)?.name, ownerType: 'student', cardNumber: card.cardNumber, className: (student.classId as any)?.name, sectionName: (student.sectionId as any)?.name, rollNumber: (student as any).rollNumber, qrCodeData: card.qrCodeData }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`); return res.send(pdf); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const generateTeacherIdCard = async (req: Request, res: Response) => { try { const teacher = await Teacher.findOne({ _id: req.params.teacherId, institutionId: (req as any).user?.institutionId }).populate('userId').populate('institutionId'); if (!teacher) return res.status(404).json({ message: 'Teacher not found' }); const card = await createCardForOwner('teacher', teacher, (req as any).user?._id || (req as any).user?.id); const pdf = await createBasicPdf({ title: 'Teacher ID Card', institutionName: (teacher.institutionId as any)?.name, name: (teacher.userId as any)?.name, ownerType: 'teacher', cardNumber: card.cardNumber, designation: teacher.designation, qrCodeData: card.qrCodeData }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`); return res.send(pdf); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const generateStaffIdCard = async (req: Request, res: Response) => { try { const staff = await Staff.findOne({ _id: req.params.staffId, institutionId: (req as any).user?.institutionId }).populate('userId').populate('institutionId'); if (!staff) return res.status(404).json({ message: 'Staff not found' }); const card = await createCardForOwner('staff', staff, (req as any).user?._id || (req as any).user?.id); const pdf = await createBasicPdf({ title: 'Staff ID Card', institutionName: (staff.institutionId as any)?.name, name: (staff.userId as any)?.name, ownerType: 'staff', cardNumber: card.cardNumber, designation: staff.designation, qrCodeData: card.qrCodeData }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`); return res.send(pdf); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const bulkGenerateIdCards = async (req: Request, res: Response) => { try { const { type = 'student', ids = [] } = req.body; if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids required' }); const ownerType = type === 'teacher' || type === 'staff' || type === 'head' ? type : 'student'; const results: any[] = []; for (const ownerId of ids.slice(0, 50)) { const owner = await getOwner(ownerType, ownerId, (req as any).user?.institutionId); if (!owner) { results.push({ ownerId, error: 'not found' }); continue; } const card = await createCardForOwner(ownerType, owner, (req as any).user?._id || (req as any).user?.id); results.push({ ownerId, cardNumber: card.cardNumber }); } return res.json({ message: `Generated ${results.length} cards`, results }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const downloadIdCard = async (req: Request, res: Response) => { try { const card = await IDCard.findOne({ _id: req.params.id, institutionId: (req as any).user?.institutionId }).populate('ownerId').populate('institutionId'); if (!card) return res.status(404).json({ message: 'Card not found' }); if (!canReadCard(req, card)) return res.status(403).json({ message: 'Access denied. Cannot download this card.' }); card.downloadCount = (card.downloadCount || 0) + 1; card.lastDownloadedAt = new Date(); await card.save(); const pdf = await createBasicPdf({ title: 'ID Card', institutionName: (card.institutionId as any)?.name, name: (card.ownerId as any)?.name, ownerType: card.ownerType, cardNumber: card.cardNumber, qrCodeData: card.qrCodeData, validityStart: card.validityStart?.toISOString().slice(0, 10), validityEnd: card.validityEnd?.toISOString().slice(0, 10) }); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(card.cardNumber)}.pdf"`); return res.send(pdf); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const emailIdCard = async (req: Request, res: Response) => { try { const { to } = req.body; if (!to) return res.status(400).json({ message: 'to required' }); const card = await IDCard.findOne({ _id: req.params.id, institutionId: (req as any).user?.institutionId }).populate('ownerId').populate('institutionId'); if (!card) return res.status(404).json({ message: 'Card not found' }); const pdf = await createBasicPdf({ title: 'ID Card', institutionName: (card.institutionId as any)?.name, name: (card.ownerId as any)?.name, ownerType: card.ownerType, cardNumber: card.cardNumber, qrCodeData: card.qrCodeData }); const sent = await sendEmail({ to, subject: `ID Card ${card.cardNumber}`, text: 'Attached ID card', html: '<p>Attached ID card.</p>', attachments: [{ filename: `${card.cardNumber}.pdf`, content: pdf, contentType: 'application/pdf' }] }); if (!sent) return res.status(502).json({ message: 'Email delivery failed' }); return res.json({ message: 'Email sent' }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const verifyByQRCode = async (req: Request, res: Response) => { try { if (!req.body.code) return res.status(400).json({ message: 'code required' }); const card = await IDCard.findOne({ qrCodeData: req.body.code }).populate('ownerId'); if (!card) return res.status(404).json({ message: 'Card not found' }); return res.json({ valid: card.status === 'active', card }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const renewIdCard = async (req: Request, res: Response) => { try { const card = await IDCard.findOne({ _id: req.params.id, institutionId: (req as any).user?.institutionId }); if (!card) return res.status(404).json({ message: 'Card not found' }); const extendYears = Number(req.body.extendYears || 1); if (req.body.action === 'request') card.status = 'pending-renewal'; else if (req.body.action === 'reject') card.status = 'active'; else { card.validityEnd = moment(card.validityEnd).add(extendYears, 'years').toDate(); card.status = 'active'; } await card.save(); return res.json({ message: 'Renewal updated', card }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const idCardStats = async (req: Request, res: Response) => { try { const match: any = { institutionId: (req as any).user?.institutionId }; const [total, byStatus, byType] = await Promise.all([IDCard.countDocuments(match), IDCard.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]), IDCard.aggregate([{ $match: match }, { $group: { _id: '$ownerType', count: { $sum: 1 }, downloads: { $sum: '$downloadCount' } } }])]); const typeCount = (type: string) => byType.find((item: any) => item._id === type)?.count || 0; const statusCount = (status: string) => byStatus.find((item: any) => item._id === status)?.count || 0; return res.json({ total, totalIssued: total, studentCards: typeCount('student'), teacherCards: typeCount('teacher'), staffCards: typeCount('staff'), expiredCards: statusCount('expired'), pendingRenewals: statusCount('pending-renewal'), downloads: byType.reduce((sum: number, item: any) => sum + (item.downloads || 0), 0), byStatus, byType }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const getAllIdCards = async (req: Request, res: Response) => { try { const cards = await IDCard.find({ institutionId: (req as any).user?.institutionId }).populate('ownerId').sort({ createdAt: -1 }).limit(300); return res.json({ cards }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const getIdCardById = async (req: Request, res: Response) => { try { const card = await IDCard.findOne({ _id: req.params.id, institutionId: (req as any).user?.institutionId }).populate('ownerId').populate('institutionId'); if (!card) return res.status(404).json({ message: 'Card not found' }); if (!canReadCard(req, card)) return res.status(403).json({ message: 'Access denied. Cannot view this card.' }); return res.json(card); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };

export const getMyIdCard = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any).user;
    const role = normalizeRole(user.role);
    if (role === 'parent') return res.status(403).json({ message: 'Parent accounts must use a child card view, not my-card.' });
    if (role === 'student') {
      const student = await resolveStudentProfileForUser(user);
      if (!student) return res.status(404).json({ message: 'Student profile was not found for this login. Please contact school office.' });
      let card = await findStudentCard(student, user);
      if (!card) {
        card = await createCardForOwner('student', student, user._id || user.id);
        card = await IDCard.findById(card._id).populate('ownerId').populate('institutionId');
      }
      return res.json({ card, student, institution: (student as any).institutionId, generated: true });
    }
    const ownerIds = unique([user?._id, user?.id]);
    let card = await IDCard.findOne({ institutionId: user.institutionId, ownerId: { $in: ownerIds } }).populate('ownerId').populate('institutionId').sort({ createdAt: -1 });
    if (!card) {
      if (['teacher', 'class_teacher', 'subject_teacher'].includes(role)) {
        const teacher = await Teacher.findOne({ userId: user._id }).populate('institutionId');
        if (teacher) {
          const generated = await createCardForOwner('teacher', teacher, user._id || user.id);
          card = await IDCard.findById(generated._id).populate('ownerId').populate('institutionId');
        }
      } else if (role === 'staff') {
        const staff = await Staff.findOne({ userId: user._id }).populate('institutionId');
        if (staff) {
          const generated = await createCardForOwner('staff', staff, user._id || user.id);
          card = await IDCard.findById(generated._id).populate('ownerId').populate('institutionId');
        }
      } else if (role === 'head' || role === 'assistant_head') {
        const teacher = await Teacher.findOne({ userId: user._id }).populate('institutionId');
        if (teacher) {
          const generated = await createCardForOwner(role === 'head' ? 'head' : 'teacher', teacher, user._id || user.id);
          card = await IDCard.findById(generated._id).populate('ownerId').populate('institutionId');
        }
      }
    }
    if (!card) return res.status(404).json({ message: 'No ID card found for current user' });
    return res.json({ card, generated: true });
  } catch (error) { return res.status(500).json({ message: 'Server error', error }); }
};

export const getChildIdCard = async (req: Request, res: Response) => {
  try {
    const user: any = (req as any).user;
    const role = normalizeRole(user.role);
    if (role !== 'parent') return res.status(403).json({ message: 'Only parent accounts can use child card view.' });
    const parent = await Parent.findOne({ institutionId: user.institutionId, userId: user._id }).lean();
    const childIds = (parent?.children || []).map((id: any) => String(id));
    if (!childIds.includes(String(req.params.studentId))) return res.status(403).json({ message: 'Access denied. This child is not linked to your parent account.' });
    const student = await Student.findOne({ _id: req.params.studentId, institutionId: user.institutionId }).populate('userId').populate('classId').populate('sectionId').populate('institutionId');
    if (!student) return res.status(404).json({ message: 'Child student profile not found.' });
    let card = await findStudentCard(student, { ...user, _id: (student as any).userId?._id || (student as any).userId, id: (student as any).userId?._id || (student as any).userId });
    if (!card) {
      card = await createCardForOwner('student', student, user._id || user.id);
      card = await IDCard.findById(card._id).populate('ownerId').populate('institutionId');
    }
    return res.json({ card, student, institution: (student as any).institutionId, generated: true });
  } catch (error) { return res.status(500).json({ message: 'Server error', error }); }
};

export const searchIdCardOwners = async (req: Request, res: Response) => { try { const type = String(req.query.type || 'student'); const search = String(req.query.search || ''); const rx = new RegExp(search, 'i'); let people: any[] = []; if (type === 'teacher') people = await Teacher.find({ institutionId: (req as any).user?.institutionId }).populate('userId', 'name avatar email phone').limit(100).lean(); else if (type === 'staff') people = await Staff.find({ institutionId: (req as any).user?.institutionId }).populate('userId', 'name avatar email phone').limit(100).lean(); else people = await Student.find({ institutionId: (req as any).user?.institutionId }).populate('userId', 'name avatar email phone').populate('classId', 'name grade').populate('sectionId', 'name').limit(200).lean(); if (search) people = people.filter((item: any) => rx.test(item.userId?.name || '') || rx.test(item.rollNumber || item.employeeId || '')); return res.json({ people }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const generateIdCardRecord = async (req: Request, res: Response) => { try { const ownerType: OwnerType = req.body.ownerType === 'teacher' || req.body.ownerType === 'staff' || req.body.ownerType === 'head' ? req.body.ownerType : 'student'; const owner = await getOwner(ownerType, req.body.ownerId, (req as any).user?.institutionId); if (!owner) return res.status(404).json({ message: 'Owner not found' }); const card = await createCardForOwner(ownerType, owner, (req as any).user?._id || (req as any).user?.id); return res.status(201).json({ message: 'ID card generated', card }); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
export const renderCardPdf = async (req: Request, res: Response) => { try { const pdf = await createBasicPdf(req.body || {}); res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', 'attachment; filename="id-card.pdf"'); return res.send(pdf); } catch (error) { return res.status(500).json({ message: 'Server error', error }); } };
