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

async function fetchImageBuffer(url?: string): Promise<Buffer | null> {
  try {
    if (!url) return null;
    if (typeof url !== 'string') return null;
    // support data URLs
    if (url.startsWith('data:')) {
      const base = url.split(',')[1];
      if (!base) return null;
      return Buffer.from(base, 'base64');
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch (err) {
    return null;
  }
}

function sanitizeFilename(value: string) {
  return String(value || 'card')
    .trim()
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '') || 'card';
}

function drawLabelValue(
  doc: any,
  label: string,
  value: string | undefined,
  x: number,
  y: number,
  labelWidth: number,
  valueWidth: number,
  labelFontSize = 11,
  valueFontSize = 11,
) {
  const safeValue = value || '';
  doc.font('Helvetica-Bold').fontSize(labelFontSize).fillColor('#111111').text(`${label}:`, x, y, { width: labelWidth });
  const labelHeight = doc.heightOfString(`${label}:`, { width: labelWidth });
  doc.font('Helvetica').fontSize(valueFontSize).fillColor('#111111').text(safeValue, x + labelWidth, y, { width: valueWidth });
  const valueHeight = doc.heightOfString(safeValue, { width: valueWidth });
  return Math.max(labelHeight, valueHeight);
}

async function generateServerPdfFromPayload(payload: any): Promise<Buffer> {
  return await new Promise<Buffer>(async (resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 28, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const isAdmitCard = String(payload.cardType || '').toLowerCase() === 'admit-card';
      const title = isAdmitCard ? 'Admit Card' : 'ID Card';
      const institutionName = payload.institutionName || 'Institution';
      const displayName = payload.name || '';
      const rollOrId = payload.idNumber || '';
      const qrData = JSON.stringify({
        cardType: payload.cardType,
        name: displayName,
        idNumber: rollOrId,
        institutionName,
        examName: payload.examName,
        examDate: payload.examDate,
        examCenter: payload.examCenter,
        centerCode: payload.centerCode,
      });
      const qrDataUrl = await QRCode.toDataURL(qrData, { width: 160, margin: 1 });
      const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

      const headerFill = isAdmitCard ? '#1d4ed8' : '#0f766e';
      const bodyFill = isAdmitCard ? '#eff6ff' : '#e8f4fd';

      doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
      doc.rect(0, 0, pageWidth, 36).fill(headerFill);
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(institutionName, 28, 11, { width: pageWidth - 56, align: 'center' });
      doc.fillColor('#0f172a');

      if (isAdmitCard) {
        const cardX = 28;
        const cardY = 58;
        const cardW = pageWidth - 56;
        const cardH = pageHeight - 86;
        const photoW = 150;
        const photoH = 188;
        const photoX = cardX + cardW - photoW - 22;
        const photoY = cardY + 26;

        doc.roundedRect(cardX, cardY, cardW, cardH, 12).fillAndStroke(bodyFill, '#1f2937');
        doc.font('Helvetica-Bold').fontSize(22).fillColor('#0f172a').text(title, cardX, cardY + 14, { width: cardW - 20, align: 'center' });
        doc.font('Helvetica').fontSize(10).fillColor('#475569').text(payload.examName || '', cardX, cardY + 40, { width: cardW - 20, align: 'center' });

        if (payload.institutionLogo) {
          const logoBuffer = await fetchImageBuffer(payload.institutionLogo);
          if (logoBuffer) {
            try { doc.image(logoBuffer, cardX + 18, cardY + 18, { fit: [56, 56] }); } catch (e) {}
          }
        }

        let textY = cardY + 76;
        const leftX = cardX + 24;
        const leftWidth = cardW - photoW - 92;
        const valueWidth = leftWidth - 132;
        const lineGap = 8;
        textY += drawLabelValue(doc, 'Student Name', displayName, leftX, textY, 120, valueWidth, 11, 11) + lineGap;
        textY += drawLabelValue(doc, 'Roll Number', rollOrId, leftX, textY, 120, valueWidth, 11, 11) + lineGap;
        textY += drawLabelValue(doc, 'Date of Birth', payload.dateOfBirth, leftX, textY, 120, valueWidth, 11, 11) + lineGap;
        textY += drawLabelValue(doc, 'Father Name', payload.fatherName, leftX, textY, 120, valueWidth, 11, 11) + lineGap;
        textY += drawLabelValue(doc, 'Class / Stream', payload.stream, leftX, textY, 120, valueWidth, 11, 11) + lineGap;

        doc.roundedRect(photoX, photoY, photoW, photoH, 8).fill('#ffffff').stroke('#111827');
        if (payload.photoUrl) {
          const photoBuffer = await fetchImageBuffer(payload.photoUrl);
          if (photoBuffer) {
            try { doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoW - 4, photoH - 4], align: 'center', valign: 'center' }); } catch (e) {}
          }
        }

        const tableY = cardY + 280;
        const tableW = cardW - 48;
        const tableX = cardX + 24;
        const rowH = 30;
        const rowBodyH = 44;
        const widths = [0.22, 0.22, 0.24, 0.32].map((ratio) => tableW * ratio);
        const headers = ['Class / Subject', 'Exam Date', 'Exam Time', 'Exam Centre'];
        let currentX = tableX;
        headers.forEach((header, index) => {
          const width = widths[index];
          doc.rect(currentX, tableY, width, rowH).fillAndStroke('#ffffff', '#111827');
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text(header, currentX + 4, tableY + 9, { width: width - 8, align: 'center' });
          currentX += width;
        });
        const rowValues = [payload.stream || '', payload.examDate || '', '', `${payload.centerCode || ''}${payload.examCenter ? `\n${payload.examCenter}` : ''}`];
        currentX = tableX;
        rowValues.forEach((value, index) => {
          const width = widths[index];
          doc.rect(currentX, tableY + rowH, width, rowBodyH).fillAndStroke('#ffffff', '#111827');
          doc.font('Helvetica').fontSize(10).fillColor('#111827').text(value, currentX + 4, tableY + rowH + 10, { width: width - 8, align: index === 3 ? 'left' : 'center' });
          currentX += width;
        });

        doc.roundedRect(cardX + cardW - 136, pageHeight - 140, 104, 104, 8).fill('#ffffff').stroke('#111827');
        try { doc.image(qrBuffer, cardX + cardW - 132, pageHeight - 136, { fit: [96, 96] }); } catch (e) {}
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#334155').text('Scan to verify', cardX + cardW - 136, pageHeight - 30, { width: 104, align: 'center' });
      } else {
        const cardW = 520;
        const cardH = 320;
        const cardX = (pageWidth - cardW) / 2;
        const cardY = 90;
        const photoW = 112;
        const photoH = 140;
        const photoX = cardX + cardW - photoW - 18;
        const photoY = cardY + 54;

        doc.roundedRect(cardX, cardY, cardW, cardH, 14).fillAndStroke(bodyFill, '#1f2937');
        doc.rect(cardX, cardY, cardW, 26).fill(headerFill);
        doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text(title, cardX, cardY + 7, { width: cardW, align: 'center' });

        if (payload.institutionLogo) {
          const logoBuffer = await fetchImageBuffer(payload.institutionLogo);
          if (logoBuffer) {
            try { doc.image(logoBuffer, cardX + 12, cardY + 36, { fit: [54, 54] }); } catch (e) {}
          }
        }

        doc.font('Helvetica-Bold').fontSize(14).fillColor('#0f172a').text(displayName, cardX + 78, cardY + 38, { width: cardW - 210, lineBreak: true });
        doc.font('Helvetica').fontSize(10).fillColor('#334155').text(payload.designation || payload.cardType || 'ID Card', cardX + 78, cardY + 58, { width: cardW - 210 });

        let y = cardY + 94;
        const leftWidth = cardW - photoW - 54;
        const valueWidth = leftWidth - 128;
        y += drawLabelValue(doc, 'ID Number', rollOrId, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Validity', payload.validityDate, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Date of Birth', payload.dateOfBirth, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Father Name', payload.fatherName, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Admission No.', payload.admissionNumber, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Registration No.', payload.registrationNumber, cardX + 18, y, 118, valueWidth, 10, 10) + 6;
        y += drawLabelValue(doc, 'Stream', payload.stream, cardX + 18, y, 118, valueWidth, 10, 10) + 6;

        doc.roundedRect(photoX, photoY, photoW, photoH, 8).fill('#ffffff').stroke('#111827');
        if (payload.photoUrl) {
          const photoBuffer = await fetchImageBuffer(payload.photoUrl);
          if (photoBuffer) {
            try { doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoW - 4, photoH - 4], align: 'center', valign: 'center' }); } catch (e) {}
          }
        }

        doc.roundedRect(cardX + cardW - 126, cardY + cardH - 126, 92, 92, 8).fill('#ffffff').stroke('#111827');
        try { doc.image(qrBuffer, cardX + cardW - 122, cardY + cardH - 122, { fit: [84, 84] }); } catch (e) {}
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#334155').text('Verify QR', cardX + cardW - 126, cardY + cardH - 28, { width: 92, align: 'center' });
      }

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

const YEAR = () => new Date().getFullYear();

const getRoleTheme = (role: string) => {
  const normalizedRole = String(role || '').toLowerCase();

  return {
    student: {
      header: '#0f766e',
      body: '#e8f4fd',
      accent: '#0ea5e9',
      title: 'Student ID Card',
    },
    teacher: {
      header: '#047857',
      body: '#ecfdf5',
      accent: '#10b981',
      title: 'Teacher ID Card',
    },
    head: {
      header: '#b45309',
      body: '#fffbeb',
      accent: '#f59e0b',
      title: 'Head ID Card',
    },
    staff: {
      header: '#334155',
      body: '#f8fafc',
      accent: '#64748b',
      title: 'Staff ID Card',
    },
  }[normalizedRole] || {
    header: '#0f766e',
    body: '#e8f4fd',
    accent: '#0ea5e9',
    title: 'ID Card',
  };
};

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
    // embed profile photo if available
    try {
      const photoUrl = (student.userId as any).avatar || '';
      const photoBuf = await fetchImageBuffer(photoUrl);
      if (photoBuf) {
        try { doc.image(photoBuf, 10, 28, { fit: [60, 80], align: 'center' }); } catch(e) {}
      }
    } catch (e) {}
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
    const ownerRole = String((teacher.userId as any)?.role || 'teacher').toLowerCase();
    const theme = getRoleTheme(ownerRole === 'head' ? 'head' : ownerRole === 'assistant_head' ? 'head' : 'teacher');
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
    doc.rect(0, 0, 255.12, 158.74).fill(theme.body);
    doc.rect(0, 0, 255.12, 18).fill(theme.header);
    doc.fillColor('#ffffff').fontSize(9).text(institution.name || 'Institution', 10, 5);
    doc.fillColor('#111827');
    doc.rect(10, 28, 60, 80).stroke();
    // embed profile photo if available
    try {
      const photoUrl = (teacher.userId as any).avatar || '';
      const photoBuf = await fetchImageBuffer(photoUrl);
      if (photoBuf) {
        try { doc.image(photoBuf, 10, 28, { fit: [60, 80], align: 'center' }); } catch(e) {}
      }
    } catch (e) {}
    doc.fontSize(10).fillColor('#111827').text(`Name: ${(teacher.userId as any).name}`, 80, 34);
    doc.text(`Role: ${ownerRole === 'head' ? 'Head' : ownerRole === 'assistant_head' ? 'Head' : 'Teacher'}`, 80, 50);
    doc.text(`Card: ${cardNumber}`, 80, 66);
    doc.text(`Designation: ${teacher.designation}`, 80, 82);
    doc.text(`Valid: ${validityStart.toISOString().slice(0,10)} - ${validityEnd.toISOString().slice(0,10)}`, 10, 120);
    doc.rect(78, 96, 90, 4).fill(theme.accent);
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
    // embed profile photo if available
    try {
      const photoUrl = (staff.userId as any).avatar || '';
      const photoBuf = await fetchImageBuffer(photoUrl);
      if (photoBuf) {
        try { doc.image(photoBuf, 10, 28, { fit: [60, 80], align: 'center' }); } catch(e) {}
      }
    } catch (e) {}
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
    const ownerRole = String((card.ownerId as any)?.role || card.ownerType || 'student').toLowerCase();
    const theme = getRoleTheme(ownerRole === 'assistant_head' ? 'head' : ownerRole);

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
      doc.rect(0, 0, 255.12, 158.74).fill(theme.body);
      doc.rect(0, 0, 255.12, 18).fill(theme.header);
      doc.fillColor('#ffffff').fontSize(9).text((card.institutionId as any).name || 'Institution', 10, 5);
      doc.fillColor('#111827');
      doc.text(`Name: ${((card.ownerId as any).name) || ''}`, 80, 34);
      doc.text(`Role: ${ownerRole === 'head' ? 'Head' : ownerRole === 'assistant_head' ? 'Head' : ownerRole}`, 80, 50);
      doc.text(`Card: ${card.cardNumber}`, 80, 66);
      doc.text(`ID Type: ${theme.title}`, 80, 82);
      doc.rect(78, 96, 90, 4).fill(theme.accent);
      if (card.qrCodeData) {
        const qr = await QRCode.toDataURL(card.qrCodeData);
        const qrBuffer = Buffer.from(qr.split(',')[1], 'base64');
        try { doc.image(qrBuffer, 200, 80, { width: 44, height: 44 }); } catch(e){}
      }
      // try embedding stored photo or owner avatar
      try {
        const photoUrl = (card as any).photoUrl || ((card.ownerId as any)?.avatar) || '';
        const photoBuf = await fetchImageBuffer(photoUrl);
        if (photoBuf) {
          try { doc.image(photoBuf, 10, 28, { fit: [60, 80], align: 'center' }); } catch(e){}
        }
      } catch (e) {}
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

export const renderCardPdf = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    if (!payload.cardType || !payload.name || !payload.idNumber) {
      return res.status(400).json({ message: 'cardType, name, and idNumber are required' });
    }

    const pdfBuffer = await generateServerPdfFromPayload(payload);
    const filename = sanitizeFilename(`${payload.cardType}-${payload.idNumber}.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    return res.status(500).json({ message: 'Server error', error });
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
