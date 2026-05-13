import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import Student from '../models/Student';
import Teacher from '../models/Teacher';
import Staff from '../models/Staff';
import IDCard from '../models/IDCard';
import { sendEmail } from '../utils/email';
import { Types } from 'mongoose';
import moment from 'moment';

const YEAR = () => new Date().getFullYear();

async function generateCardNumber(ownerType: string, institutionId: Types.ObjectId) {
  const prefix = ownerType === 'student' ? 'STU' : ownerType === 'teacher' ? 'TCH' : 'STF';
  const year = YEAR();
  // count existing for this year and type within institution
  const start = new Date(`${year}-01-01T00:00:00Z`);
  const end = new Date(`${year}-12-31T23:59:59Z`);
  const count = await IDCard.countDocuments({ ownerType, institutionId, issuedAt: { $gte: start, $lte: end } });
  const seq = (count || 0) + 1;
  return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

export const generateStudentIdCard = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId)
      .populate('userId')
      .populate('classId')
      .populate('sectionId')
      .populate('institutionId');

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    // prepare IDCard doc
    const institution = student.institutionId as any;
    const cardNumber = await generateCardNumber('student', institution._id);

    const qrData = `easy_school://idcard/${cardNumber}`;
    const qrCodeDataURL = await QRCode.toDataURL(qrData);

    const now = new Date();
    const validityStart = now;
    const validityEnd = moment(now).add(1, 'year').toDate();

    const idCard = new IDCard({
      ownerId: student.userId._id,
      ownerType: 'student',
      cardNumber,
      cardType: 'student',
      photoUrl: (student.userId as any).avatar || '',
      qrCodeData: qrData,
      barcodeData: cardNumber,
      validityStart,
      validityEnd,
      status: 'active',
      issuedBy: req.user?._id || req.user?.id,
      issuedAt: now,
      institutionId: institution._id,
      downloadCount: 0
    });

    await idCard.save();

    // Create PDF
    const doc = new PDFDocument({ size: [255.12, 158.74] }); // CR80
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cardNumber}.pdf"`);
    doc.pipe(res);

    // background (blue-white)
    doc.rect(0, 0, 255.12, 158.74).fill('#e8f4fd');
    doc.fontSize(10).fillColor('#000').text(institution.name || 'Institution', 10, 8);

    // photo box
    doc.rect(10, 28, 60, 80).stroke();
    doc.fontSize(10).text(`Name: ${(student.userId as any).name}`, 80, 34);
    doc.text(`Card: ${cardNumber}`, 80, 50);
    doc.text(`Class: ${(student.classId as any)?.name || ''}`, 80, 66);
    doc.text(`Valid: ${validityStart.toISOString().slice(0,10)} - ${validityEnd.toISOString().slice(0,10)}`, 10, 120);

    // QR
    const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
    try { doc.image(qrBuffer, 200, 80, { width: 44, height: 44 }); } catch(e){}

    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const generateTeacherIdCard = async (req: Request, res: Response) => {
  try {
    const { teacherId } = req.params;
    const teacher = await Teacher.findById(teacherId)
      .populate('userId')
      .populate('subjects')
      .populate('institutionId');

    if (!teacher) {
      return res.status(404).json({ message: 'Teacher not found' });
    }

    const institution = teacher.institutionId as any;
    const cardNumber = await generateCardNumber('teacher', institution._id);
    const qrData = `easy_school://idcard/${cardNumber}`;
    const qrCodeDataURL = await QRCode.toDataURL(qrData);
    const now = new Date();
    const validityStart = now;
    const validityEnd = moment(now).add(1, 'year').toDate();

    const idCard = new IDCard({
      ownerId: teacher.userId._id,
      ownerType: 'teacher',
      cardNumber,
      cardType: 'teacher',
      photoUrl: (teacher.userId as any).avatar || '',
      qrCodeData: qrData,
      barcodeData: cardNumber,
      validityStart,
      validityEnd,
      status: 'active',
      issuedBy: req.user?._id || req.user?.id,
      issuedAt: now,
      institutionId: institution._id,
      downloadCount: 0
    });
    await idCard.save();

    const doc = new PDFDocument({ size: [255.12, 158.74] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cardNumber}.pdf"`);
    doc.pipe(res);
    doc.rect(0, 0, 255.12, 158.74).fill('#e9f7ef');
    doc.fontSize(10).text(institution.name || 'Institution', 10, 8);
    doc.rect(10, 28, 60, 80).stroke();
    doc.fontSize(10).text(`Name: ${(teacher.userId as any).name}`, 80, 34);
    doc.text(`Card: ${cardNumber}`, 80, 50);
    doc.text(`Designation: ${teacher.designation}`, 80, 66);
    doc.text(`Valid: ${validityStart.toISOString().slice(0,10)} - ${validityEnd.toISOString().slice(0,10)}`, 10, 120);
    const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
    try { doc.image(qrBuffer, 200, 80, { width: 44, height: 44 }); } catch(e){}
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const generateStaffIdCard = async (req: Request, res: Response) => {
  try {
    const { staffId } = req.params;
    const staff = await Staff.findById(staffId)
      .populate('userId')
      .populate('institutionId');

    if (!staff) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    const institution = staff.institutionId as any;
    const cardNumber = await generateCardNumber('staff', institution._id);
    const qrData = `easy_school://idcard/${cardNumber}`;
    const qrCodeDataURL = await QRCode.toDataURL(qrData);
    const now = new Date();
    const validityStart = now;
    const validityEnd = moment(now).add(1, 'year').toDate();

    const idCard = new IDCard({
      ownerId: staff.userId._id,
      ownerType: 'staff',
      cardNumber,
      cardType: 'staff',
      photoUrl: (staff.userId as any).avatar || '',
      qrCodeData: qrData,
      barcodeData: cardNumber,
      validityStart,
      validityEnd,
      status: 'active',
      issuedBy: req.user?._id || req.user?.id,
      issuedAt: now,
      institutionId: institution._id,
      downloadCount: 0
    });
    await idCard.save();

    const doc = new PDFDocument({ size: [255.12, 158.74] });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cardNumber}.pdf"`);
    doc.pipe(res);
    doc.rect(0, 0, 255.12, 158.74).fill('#fff7ed');
    doc.fontSize(10).text(institution.name || 'Institution', 10, 8);
    doc.rect(10, 28, 60, 80).stroke();
    doc.fontSize(10).text(`Name: ${(staff.userId as any).name}`, 80, 34);
    doc.text(`Card: ${cardNumber}`, 80, 50);
    doc.text(`Designation: ${staff.designation}`, 80, 66);
    doc.text(`Valid: ${validityStart.toISOString().slice(0,10)} - ${validityEnd.toISOString().slice(0,10)}`, 10, 120);
    const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
    try { doc.image(qrBuffer, 200, 80, { width: 44, height: 44 }); } catch(e){}
    doc.end();
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const bulkGenerateIdCards = async (req: Request, res: Response) => {
  try {
    const { type, ids } = req.body; // type: 'student' | 'teacher' | 'staff', ids: array of owner IDs
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ message: 'ids required' });
    if (ids.length > 50) return res.status(400).json({ message: 'Max 50 at a time' });

    const results: any[] = [];
    for (const ownerId of ids) {
      // create minimal idcard record; generation of PDFs can be async job
      const ownerType = type;
      const owner = await (type === 'student' ? Student.findById(ownerId).populate('userId').populate('institutionId') : type === 'teacher' ? Teacher.findById(ownerId).populate('userId').populate('institutionId') : Staff.findById(ownerId).populate('userId').populate('institutionId'));
      if (!owner) { results.push({ ownerId, error: 'not found' }); continue; }
      const institution = (owner as any).institutionId as any;
      const cardNumber = await generateCardNumber(ownerType, institution._id);
      const qrData = `easy_school://idcard/${cardNumber}`;
      const now = new Date();
      const validityStart = now;
      const validityEnd = moment(now).add(1, 'year').toDate();
      const idCard = new IDCard({ ownerId: (owner as any).userId._id, ownerType, cardNumber, cardType: ownerType, qrCodeData: qrData, barcodeData: cardNumber, validityStart, validityEnd, status: 'active', issuedBy: req.user?._id || req.user?.id, issuedAt: now, institutionId: institution._id, downloadCount: 0 });
      await idCard.save();
      results.push({ ownerId, cardNumber });
    }
    res.json({ message: `Generated ${results.length} cards`, results });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const downloadIdCard = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // id is card id
    const format = req.query.format === 'png' ? 'png' : 'pdf';
    const card = await IDCard.findById(id).populate('institutionId').populate('ownerId');
    if (!card) return res.status(404).json({ message: 'Card not found' });

    // increment download
    card.downloadCount = (card.downloadCount || 0) + 1;
    card.lastDownloadedAt = new Date();
    await card.save();

    // Re-generate PDF as returned earlier
    const doc = new PDFDocument({ size: [255.12, 158.74] });
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`);
      doc.pipe(res);
      doc.rect(0, 0, 255.12, 158.74).fill('#fff');
      doc.fontSize(10).text((card.institutionId as any).name || 'Institution', 10, 8);
      doc.text(`Name: ${((card.ownerId as any).name) || ''}`, 80, 34);
      doc.text(`Card: ${card.cardNumber}`, 80, 50);
      if (card.qrCodeData) {
        const qr = await QRCode.toDataURL(card.qrCodeData);
        const qrBuffer = Buffer.from(qr.split(',')[1], 'base64');
        try { doc.image(qrBuffer, 200, 80, { width: 44, height: 44 }); } catch(e){}
      }
      doc.end();
    } else {
      // For png, render PDF to PNG would require heavy libs; fallback: return JSON with data
      res.json({ message: 'PNG generation not implemented on server; use client-side capture', card });
    }
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const emailIdCard = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // id is card id
    const { to } = req.body;
    if (!to) return res.status(400).json({ message: 'to required' });
    const card = await IDCard.findById(id).populate('institutionId').populate('ownerId');
    if (!card) return res.status(404).json({ message: 'Card not found' });

    // create PDF buffer
    const doc = new PDFDocument({ size: [255.12, 158.74] });
    const chunks: any[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      const sent = await sendEmail({
        to,
        subject: `ID Card ${card.cardNumber}`,
        text: 'Attached ID card',
        html: '<p>Attached ID card.</p>',
        attachments: [{ filename: `${card.cardNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
      });
      if (!sent) return res.status(502).json({ message: 'Email delivery failed' });
      res.json({ message: 'Email sent' });
    });
    doc.rect(0, 0, 255.12, 158.74).fill('#fff');
    doc.fontSize(10).text((card.institutionId as any).name || 'Institution', 10, 8);
    doc.text(`Name: ${((card.ownerId as any).name) || ''}`, 80, 34);
    doc.text(`Card: ${card.cardNumber}`, 80, 50);
    doc.end();
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const verifyByQRCode = async (req: Request, res: Response) => {
  try {
    const { code } = req.body; // code string from QR
    if (!code) return res.status(400).json({ message: 'code required' });
    const card = await IDCard.findOne({ qrCodeData: code }).populate('ownerId');
    if (!card) return res.status(404).json({ message: 'Card not found' });
    return res.json({ valid: card.status === 'active', card });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const renewIdCard = async (req: Request, res: Response) => {
  try {
    const { id } = req.params; // card id
    const { extendYears = 1, action = 'approve' } = req.body;
    const card = await IDCard.findById(id);
    if (!card) return res.status(404).json({ message: 'Card not found' });
    if (action === 'request') {
      card.status = 'pending-renewal';
      await card.save();
      return res.json({ message: 'Renewal requested', card });
    }
    if (action === 'reject') {
      card.status = 'active';
      await card.save();
      return res.json({ message: 'Renewal rejected', card });
    }
    card.validityEnd = moment(card.validityEnd).add(extendYears, 'years').toDate();
    card.status = 'active';
    await card.save();
    res.json({ message: 'Renewed', card });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const idCardStats = async (req: Request, res: Response) => {
  try {
    const match: any = {};
    if (req.user?.institutionId) match.institutionId = req.user.institutionId;
    const total = await IDCard.countDocuments(match);
    const [byStatus, byType, monthlyDownloads] = await Promise.all([
      IDCard.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      IDCard.aggregate([{ $match: match }, { $group: { _id: '$ownerType', count: { $sum: 1 }, downloads: { $sum: '$downloadCount' } } }]),
      IDCard.aggregate([
        { $match: { ...match, lastDownloadedAt: { $exists: true } } },
        { $group: { _id: { year: { $year: '$lastDownloadedAt' }, month: { $month: '$lastDownloadedAt' } }, value: { $sum: '$downloadCount' } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);
    const typeCount = (type: string) => byType.find((item: any) => item._id === type)?.count || 0;
    const statusCount = (status: string) => byStatus.find((item: any) => item._id === status)?.count || 0;
    res.json({
      total,
      totalIssued: total,
      studentCards: typeCount('student'),
      teacherCards: typeCount('teacher'),
      staffCards: typeCount('staff'),
      expiredCards: statusCount('expired'),
      pendingRenewals: statusCount('pending-renewal'),
      downloads: byType.reduce((sum: number, item: any) => sum + (item.downloads || 0), 0),
      byStatus,
      byType,
      monthlyDownloads: monthlyDownloads.map((item: any) => ({ name: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`, value: item.value })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const getMyIdCard = async (req: Request, res: Response) => {
  try {
    const card = await IDCard.findOne({ ownerId: req.user?._id || req.user?.id, institutionId: req.user?.institutionId })
      .populate('ownerId')
      .populate('institutionId')
      .sort({ createdAt: -1 });
    if (!card) return res.status(404).json({ message: 'No ID card found for current user' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const searchIdCardOwners = async (req: Request, res: Response) => {
  try {
    const type = String(req.query.type || 'student');
    const search = String(req.query.search || '');
    const commonPopulate = 'name avatar email';
    const rx = new RegExp(search, 'i');
    let people: any[] = [];
    if (type === 'teacher') {
      people = await Teacher.find({ institutionId: req.user?.institutionId }).populate('userId', commonPopulate).limit(100).lean();
    } else if (type === 'staff') {
      people = await Staff.find({ institutionId: req.user?.institutionId }).populate('userId', commonPopulate).limit(100).lean();
    } else {
      people = await Student.find({ institutionId: req.user?.institutionId }).populate('userId', commonPopulate).populate('classId', 'name grade').populate('sectionId', 'name').limit(200).lean();
    }
    if (search) people = people.filter((item: any) => rx.test(item.userId?.name || '') || rx.test(item.rollNumber || item.employeeId || ''));
    res.json({ people });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const generateIdCardRecord = async (req: Request, res: Response) => {
  try {
    const { ownerType, ownerId } = req.body;
    const owner = await (ownerType === 'teacher'
      ? Teacher.findById(ownerId).populate('userId').populate('institutionId')
      : ownerType === 'staff'
        ? Staff.findById(ownerId).populate('userId').populate('institutionId')
        : Student.findById(ownerId).populate('userId').populate('institutionId'));
    if (!owner) return res.status(404).json({ message: 'Owner not found' });
    const institution = (owner as any).institutionId as any;
    const cardNumber = await generateCardNumber(ownerType, institution._id);
    const now = new Date();
    const validityEnd = moment(now).add(1, 'year').toDate();
    const card = await IDCard.create({
      ownerId: (owner as any).userId._id,
      ownerType,
      cardNumber,
      cardType: ownerType,
      photoUrl: (owner as any).userId.avatar || '',
      qrCodeData: `easy_school://idcard/${cardNumber}`,
      barcodeData: cardNumber,
      validityStart: now,
      validityEnd,
      status: 'active',
      issuedBy: req.user?._id || req.user?.id,
      issuedAt: now,
      institutionId: institution._id,
      downloadCount: 0,
    });
    res.status(201).json({ card: await IDCard.findById(card._id).populate('ownerId').populate('institutionId') });
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const getIdCardTemplates = async (req: Request, res: Response) => {
  try {
    // Return available ID card templates
    const templates = [
      { id: 'standard', name: 'Standard Template', description: 'Basic ID card layout' },
      { id: 'premium', name: 'Premium Template', description: 'Enhanced design with more fields' }
    ];
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
};

export const getAllIdCards = async (req: Request, res: Response) => {
  try {
    const { institutionId, ownerType, status } = req.query;
    const filter: any = {};
    if (institutionId) filter.institutionId = institutionId;
    if (ownerType) filter.ownerType = ownerType;
    if (status) filter.status = status;
    const cards = await IDCard.find(filter).populate('ownerId').limit(200).sort({ createdAt: -1 });
    res.json(cards);
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};

export const getIdCardById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const card = await IDCard.findById(id).populate('ownerId').populate('institutionId');
    if (!card) return res.status(404).json({ message: 'Card not found' });
    res.json(card);
  } catch (err) {
    res.status(500).json({ message: 'Server error', err });
  }
};
