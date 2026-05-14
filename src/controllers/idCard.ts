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
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    try {
      const pageWidth = doc.page.width;
      const pageHeight = doc.page.height;
      const rawCardType = String(payload.cardType || '').toLowerCase();
      const cardType = rawCardType === 'student-id'
        ? 'student'
        : rawCardType === 'teacher-id' || rawCardType === 'head-id'
          ? 'teacher'
          : rawCardType === 'staff-id'
            ? 'staff'
            : rawCardType;

      if (cardType === 'teacher' || cardType === 'staff') {
        // Teacher ID Card Design
        const cardW = 350;
        const cardH = 500;
        const gap = 30;
        const totalW = cardW * 2 + gap;
        const cardX = (pageWidth - totalW) / 2;
        const cardY = (pageHeight - cardH) / 2;
        const backX = cardX + cardW + gap;
        const institutionName = payload.institutionName || 'Institute Logo';
        const qrData = JSON.stringify({
          cardType: cardType === 'teacher' ? 'teacher-id' : 'staff-id',
          name: payload.name || '',
          idNumber: payload.idNumber || '',
          institutionName,
        });
        const qrDataUrl = await QRCode.toDataURL(qrData, { width: 160, margin: 1 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

        // Card background - Dark blue
        doc.roundedRect(cardX, cardY, cardW, cardH, 15).fill('#002B36');

        // Top White Section - Curved
        const whiteH = 230;
        doc.save();
        doc.roundedRect(cardX, cardY, cardW, whiteH, 15).clip();
        doc.rect(cardX, cardY, cardW, whiteH).fill('#ffffff');
        doc.moveTo(cardX, cardY + whiteH).lineTo(cardX + cardW, cardY + whiteH).lineTo(cardX + cardW, cardY + whiteH - 25).quadraticCurveTo(cardX + cardW/2, cardY + whiteH - 45, cardX, cardY + whiteH - 25).fill('#ffffff');
        doc.restore();

        // Gold accent corner
        doc.moveTo(cardX, cardY).lineTo(cardX + 90, cardY).lineTo(cardX, cardY + 90).fill('#D49B41');

        // Photo container
        const photoY = cardY + 45;
        const photoW = 150;
        const photoH = 180;
        const photoX = cardX + (cardW - photoW) / 2;
        doc.roundedRect(photoX, photoY, photoW, photoH, 30).lineWidth(6).stroke('#002B36');
        if (payload.photoUrl) {
          const photoBuffer = await fetchImageBuffer(payload.photoUrl);
          if (photoBuffer) {
            try { doc.image(photoBuffer, photoX + 3, photoY + 3, { fit: [photoW - 6, photoH - 6], align: 'center', valign: 'center' }); } catch (e) {}
          }
        }

        // Content Area
        const contentY = photoY + photoH + 10;
        const title = cardType === 'staff' ? 'STAFF' : String(payload.role || 'TEACHER').toUpperCase();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(45).text(title, cardX, contentY, { width: cardW, align: 'center' });

        // Info table
        const tableY = contentY + 60;
        const tableW = cardW * 0.9;
        const tableX = cardX + cardW * 0.05;
        const rowH = 25;
        const labels = cardType === 'staff'
          ? ['Name:', 'Designation:', 'ID Number:', 'Joined:']
          : ['Name:', 'Qualification:', 'ID Number:', 'Working Since:'];
        const values = [
          payload.name || '',
          payload.qualification || payload.designation || payload.stream || '',
          payload.idNumber || '',
          payload.workingSince || payload.joined || payload.joinDate || payload.validityDate || ''
        ];

        doc.save();
        doc.rect(tableX - 5, tableY - 5, tableW + 10, labels.length * rowH + 10).fill('#001f28');
        doc.restore();

        labels.forEach((label, i) => {
          const y = tableY + i * rowH;
          doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(13).text(label, tableX, y + 6, { width: tableW * 0.4 });
          doc.font('Helvetica').fontSize(13).text(values[i], tableX + tableW * 0.4, y + 6, { width: tableW * 0.6 });
        });

        // Footer
        const footerY = cardY + cardH - 50;
        doc.rect(cardX, footerY, cardW, 50).fill('#002B36');
        doc.rect(cardX + 8, footerY + 8, 30, 34).fill('#002B36');
        doc.fillColor('#D49B41').font('Helvetica-Bold').fontSize(14).text('LOGO', cardX + 10, footerY + 17);
        doc.fillColor('#D49B41').fontSize(15).text(institutionName, cardX + 40, footerY + 10, { width: cardW - 55 });
        doc.fillColor('#cccccc').font('Helvetica').fontSize(10).text(payload.institutionAddress || payload.institutionPhone || '', cardX + 40, footerY + 25, { width: cardW - 55 });

        doc.roundedRect(backX, cardY, cardW, cardH, 15).fill('#ffffff');
        doc.rect(backX, cardY, cardW, 100).fill('#002B36');
        doc.roundedRect(backX, cardY + 70, cardW, 60, 30).fill('#002B36');

        doc.fillColor('#D49B41').font('Helvetica-Bold').fontSize(16).text(institutionName, backX + 20, cardY + 28, { width: 220 });
        doc.fillColor('#cccccc').font('Helvetica').fontSize(10).text('Education for future', backX + 20, cardY + 49, { width: 220 });
        doc.fillColor('#D49B41').font('Helvetica-Bold').fontSize(18).text('LOGO', backX + 275, cardY + 39, { width: 55, align: 'right' });

        const termsY = cardY + 125;
        doc.fillColor('#002B36').font('Helvetica-Bold').fontSize(16).text('Terms & Conditions', backX + 25, termsY);
        doc.moveTo(backX + 25, termsY + 20).lineTo(backX + 157, termsY + 20).lineWidth(2).stroke('#D49B41');

        const terms = [
          'This card is property of the Institute.',
          'Loss must be reported immediately to the office.',
          'Always wear this ID card within premises.',
          'Non-transferable and must be returned on exit.',
        ];
        doc.fillColor('#555555').font('Helvetica').fontSize(11);
        terms.forEach((term, index) => {
          doc.text(`- ${term}`, backX + 42, termsY + 34 + index * 22, { width: 260 });
        });

        doc.rect(backX + 25, cardY + 335, 88, 88).fill('#ffffff').stroke('#dddddd');
        try { doc.image(qrBuffer, backX + 29, cardY + 339, { fit: [80, 80] }); } catch (e) {}

        doc.moveTo(backX + 205, cardY + 392).lineTo(backX + 325, cardY + 392).lineWidth(1).stroke('#002B36');
        doc.fillColor('#333333').font('Helvetica-Bold').fontSize(10).text(payload.headName || 'AUTHORITY SIGN', backX + 205, cardY + 397, { width: 120, align: 'center' });

        const addressFooterY = cardY + cardH - 90;
        doc.rect(backX, addressFooterY, cardW, 84).fill('#f9f9f9');
        doc.moveTo(backX, addressFooterY).lineTo(backX + cardW, addressFooterY).lineWidth(1).stroke('#eeeeee');
        doc.fillColor('#666666').font('Helvetica').fontSize(10);
        [
          payload.institutionAddress || '',
          [payload.institutionPhone, payload.institutionEmail].filter(Boolean).join(' | '),
          payload.institutionWebsite || '',
        ].filter(Boolean).forEach((line, index) => {
          doc.text(line, backX + 25, addressFooterY + 15 + index * 15, { width: cardW - 50 });
        });
        doc.rect(backX, cardY + cardH - 6, cardW, 6).fill('#D49B41');

      } else if (cardType === 'student') {
        const cardW = 350;
        const cardH = 500;
        const gap = 30;
        const totalW = cardW * 2 + gap;
        const cardX = (pageWidth - totalW) / 2;
        const cardY = (pageHeight - cardH) / 2;
        const backX = cardX + cardW + gap;
        const institutionName = payload.institutionName || 'LOGO';
        const session = payload.session || payload.validityDate || `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`;
        const qrData = payload.qrData || JSON.stringify({
          cardType: 'student-id',
          name: payload.name || '',
          idNumber: payload.idNumber || '',
          institutionName,
          class: payload.stream || '',
        });
        const qrDataUrl = await QRCode.toDataURL(qrData, { width: 160, margin: 1 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');

        doc.roundedRect(cardX, cardY, cardW, cardH, 12).fill('#ffffff');
        doc.roundedRect(cardX, cardY, cardW, cardH, 12).lineWidth(1).stroke('#000000');
        const headerH = 180;
        doc.rect(cardX, cardY, cardW, headerH).fill('#1A1A1A');

        doc.save();
        doc.rect(cardX, cardY, cardW, headerH).clip();
        doc.moveTo(cardX, cardY + headerH).lineTo(cardX + cardW, cardY + headerH).lineTo(cardX + cardW, cardY + headerH - 80).quadraticCurveTo(cardX + cardW/2, cardY + headerH - 100, cardX, cardY + headerH - 80).fill('#1E73BE');
        doc.restore();

        const photoSize = 120;
        const photoX = cardX + (cardW - photoSize) / 2;
        const photoY = cardY + headerH - photoSize / 2;
        doc.circle(photoX + photoSize/2, photoY + photoSize/2, photoSize/2).fill('#ffffff');
        doc.circle(photoX + photoSize/2, photoY + photoSize/2, photoSize/2).lineWidth(4).stroke('#ffffff');
        if (payload.photoUrl) {
          const photoBuffer = await fetchImageBuffer(payload.photoUrl);
          if (photoBuffer) {
            doc.save();
            doc.circle(photoX + photoSize/2, photoY + photoSize/2, photoSize/2 - 2).clip();
            try { doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoSize - 4, photoSize - 4], align: 'center', valign: 'center' }); } catch (e) {}
            doc.restore();
          }
        }

        const detailsY = photoY + photoSize + 10;
        const nameParts = (payload.name || 'John Smith').split(' ');
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        doc.font('Helvetica-Bold').fontSize(24);
        const firstWidth = doc.widthOfString(firstName);
        const gapWidth = lastName ? doc.widthOfString(' ') : 0;
        const lastWidth = lastName ? doc.widthOfString(lastName) : 0;
        const nameStartX = cardX + (cardW - firstWidth - gapWidth - lastWidth) / 2;
        doc.fillColor('#1E73BE').text(firstName, nameStartX, detailsY, { lineBreak: false });
        if (lastName) doc.fillColor('#333333').text(` ${lastName}`, nameStartX + firstWidth, detailsY, { lineBreak: false });
        doc.fillColor('#888888').font('Helvetica-Bold').fontSize(13).text('Student', cardX, detailsY + 34, { width: cardW, align: 'center', characterSpacing: 2 });

        const fieldsY = detailsY + 80;
        const fieldLabels = ['ID NO :', 'SESSION :', 'Phone :', 'Mail :'];
        const fieldValues = [
          payload.idNumber || '',
          session,
          payload.phone || '',
          payload.mail || payload.email || ''
        ];

        fieldLabels.forEach((label, i) => {
          const y = fieldsY + i * 25;
          doc.fillColor('#bbbbbb').font('Helvetica-Bold').fontSize(11).text(label, cardX + 20, y, { width: 90 });
          doc.fillColor('#444444').font('Helvetica').fontSize(13).text(fieldValues[i], cardX + 110, y, { width: cardW - 130 });
        });

        const footerY = cardY + cardH - 60;
        doc.rect(cardX, footerY, cardW, 60).fill('#1A1A1A');
        doc.moveTo(cardX, footerY).lineTo(cardX + cardW * 0.45, footerY).lineTo(cardX + cardW * 0.34, footerY + 60).lineTo(cardX, footerY + 60).fill('#1E73BE');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(institutionName, cardX + cardW - 150, footerY + 20, { width: 125, align: 'right', characterSpacing: 3 });

        doc.roundedRect(backX, cardY, cardW, cardH, 12).fill('#ffffff');
        doc.roundedRect(backX, cardY, cardW, cardH, 12).lineWidth(1).stroke('#eeeeee');
        doc.rect(backX, cardY, cardW, 120).fill('#1A1A1A');
        doc.save();
        doc.rect(backX, cardY, cardW, 150).clip();
        doc.moveTo(backX, cardY + 90).lineTo(backX + cardW, cardY + 90).lineTo(backX + cardW, cardY + 150).quadraticCurveTo(backX + cardW / 2, cardY + 118, backX, cardY + 150).fill('#1E73BE');
        doc.restore();
        doc.roundedRect(backX + 135, cardY + 15, 80, 80, 8).fill('#ffffff');
        try { doc.image(qrBuffer, backX + 140, cardY + 20, { fit: [70, 70] }); } catch (e) {}

        const contentY = cardY + 170;
        doc.fillColor('#1E73BE').font('Helvetica-Bold').fontSize(14).text('INSTRUCTIONS', backX, contentY, { width: cardW, align: 'center' });
        const instructions = [
          'This card must be presented on demand by the authority.',
          'In case of loss, inform the registrar office immediately.',
          'Misuse of this card is a punishable offense.',
          'Return the card upon completion of the course.',
        ];
        doc.fillColor('#777777').font('Helvetica').fontSize(11);
        instructions.forEach((item, index) => {
          doc.text(`- ${item}`, backX + 45, contentY + 30 + index * 18, { width: 260 });
        });

        const contactY = contentY + 160;
        doc.moveTo(backX + 30, contactY).lineTo(backX + cardW - 30, contactY).lineWidth(1).stroke('#eeeeee');
        doc.fillColor('#333333').font('Helvetica-Bold').fontSize(11).text('OFFICE ADDRESS', backX + 30, contactY + 15, { width: cardW - 60, align: 'center' });
        doc.fillColor('#444444').font('Helvetica').fontSize(11);
        [
          payload.institutionAddress || '',
          [payload.institutionPhone, payload.institutionEmail].filter(Boolean).join(' | '),
          payload.institutionWebsite || '',
        ].filter(Boolean).forEach((line, index) => {
          doc.text(line, backX + 30, contactY + 35 + index * 15, { width: cardW - 60, align: 'center' });
        });

        doc.rect(backX, footerY, cardW, 60).fill('#1A1A1A');
        doc.moveTo(backX, footerY).lineTo(backX + cardW * 0.45, footerY).lineTo(backX + cardW * 0.34, footerY + 60).lineTo(backX, footerY + 60).fill('#1E73BE');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text(institutionName, backX + cardW - 150, footerY + 20, { width: 125, align: 'right', characterSpacing: 3 });

      } else if (cardType === 'admit-card') {
        // Admit Card Design - IGNOU Style
        const cardW = 800;
        const cardH = 600;
        const cardX = (pageWidth - cardW) / 2;
        const cardY = (pageHeight - cardH) / 2;

        // Border
        doc.rect(cardX, cardY, cardW, cardH).lineWidth(2).stroke('#000000');

        // Header Section
        const headerY = cardY + 30;
        const headerH = 80;

        // University Info with Logo
        const logoSize = 70;
        const logoX = cardX + 20;
        doc.circle(logoX + logoSize/2, headerY + logoSize/2, logoSize/2).fill('#0A66A3');
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(24).text('IGNOU', logoX + logoSize/2 - 25, headerY + logoSize/2 - 8, { width: 50, align: 'center' });

        // Titles
        const titleX = logoX + logoSize + 20;
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(22).text('Indira Gandhi National Open University', titleX, headerY + 5, { width: cardW - 200 });
        doc.fillColor('#444444').font('Helvetica-Bold').fontSize(18).text('ADMIT CARD – Term End Examination', titleX, headerY + 35, { width: cardW - 200 });

        // QR Code Top Right
        const qrSize = 90;
        const qrX = cardX + cardW - qrSize - 20;
        const qrY = headerY;
        doc.rect(qrX, qrY, qrSize, qrSize).fill('#ffffff').stroke('#cccccc');
        const qrData = JSON.stringify({
          cardType: 'admit-card',
          enrollmentNumber: payload.enrollmentNumber,
          name: payload.name,
          examName: payload.examName
        });
        const qrDataUrl = await QRCode.toDataURL(qrData, { width: 180, margin: 1 });
        const qrBuffer = Buffer.from(qrDataUrl.split(',')[1], 'base64');
        try { doc.image(qrBuffer, qrX + 3, qrY + 3, { fit: [qrSize - 6, qrSize - 6] }); } catch (e) {}
        doc.fillColor('#000000').font('Helvetica-Bold').fontSize(9).text('Verify Admit', qrX, qrY + qrSize + 3, { width: qrSize, align: 'center' });

        // Header bottom line
        doc.moveTo(cardX, headerY + headerH).lineTo(cardX + cardW, headerY + headerH).lineWidth(2).stroke('#333333');

        // Body Section
        const bodyY = headerY + headerH + 25;
        const bodyH = 160;

        // Info Grid
        const infoX = cardX + 20;
        const infoLabels = ['Enrollment Number:', 'Programm:', 'Regional Centre:', 'Date of Birth:', 'Medium:'];
        const infoValues = [
          payload.enrollmentNumber || payload.name || '',
          payload.program || 'BACHELOR OF ARTS (BAG)',
          payload.regionalCentre || 'Delhi-1',
          payload.dateOfBirth || '15 Feb 2000',
          payload.medium || 'English'
        ];

        infoLabels.forEach((label, i) => {
          const y = bodyY + i * 22;
          doc.fillColor('#000000').font('Helvetica-Bold').fontSize(15).text(label, infoX, y, { width: 180 });
          doc.font('Helvetica').fontSize(15).text(infoValues[i], infoX + 180, y, { width: 200 });
        });

        // Photo
        const photoW = 130;
        const photoH = 160;
        const photoX = cardX + cardW - photoW - 20;
        const photoY = bodyY;
        doc.rect(photoX, photoY, photoW, photoH).fill('#fafafa').stroke('#000000');
        if (payload.photoUrl) {
          const photoBuffer = await fetchImageBuffer(payload.photoUrl);
          if (photoBuffer) {
            try { doc.image(photoBuffer, photoX + 2, photoY + 2, { fit: [photoW - 4, photoH - 4], align: 'center', valign: 'center' }); } catch (e) {}
          }
        }

        // Exam Table
        const tableY = bodyY + bodyH + 20;
        const tableW = cardW - 40;
        const tableX = cardX + 20;
        const rowH = 35;
        const colWidths = [0.25, 0.25, 0.25, 0.25].map(r => tableW * r);
        const headers = ['Course Code', 'Exam Date', 'Exam Time', 'Exam Centre'];

        // Header row
        let currentX = tableX;
        headers.forEach((header, i) => {
          doc.rect(currentX, tableY, colWidths[i], rowH).fill('#f0f0f0').stroke('#000000');
          doc.fillColor('#000000').font('Helvetica-Bold').fontSize(13).text(header, currentX + 4, tableY + 12, { width: colWidths[i] - 8, align: 'left' });
          currentX += colWidths[i];
        });

        // Data rows
        const examData = payload.examData || [
          { courseCode: 'BEVAE-181', examDate: '20-June-2024', examTime: 'Morning (10:00 AM)', examCentre: '0757D - Study Centre, Delhi' },
          { courseCode: 'BHIC-131', examDate: '23-June-2024', examTime: 'Morning (10:00 AM)', examCentre: '0757D - Delhi Central' },
          { courseCode: 'BPSC-131', examDate: '26-June-2024', examTime: 'Morning (10:00 AM)', examCentre: '0757D - New Delhi' }
        ];

        examData.forEach((exam: any, i: number) => {
          const rowY = tableY + rowH + i * rowH;
          currentX = tableX;
          const values = [exam.courseCode || '', exam.examDate || '', exam.examTime || '', exam.examCentre || ''];
          values.forEach((value, j) => {
            doc.rect(currentX, rowY, colWidths[j], rowH).fill('#ffffff').stroke('#000000');
            doc.fillColor('#000000').font('Helvetica').fontSize(13).text(value, currentX + 4, rowY + 12, { width: colWidths[j] - 8, align: 'left' });
            currentX += colWidths[j];
          });
        });

        // Footer Note
        const noteY = tableY + rowH + (examData.length * rowH) + 20;
        doc.fillColor('#555555').font('Helvetica-Oblique').fontSize(11).text('* This is a computer-generated document. Please bring this card along with a valid Identity Proof to the examination hall. Use of unfair means will lead to cancellation of candidature.', cardX + 20, noteY, { width: cardW - 40, align: 'left' });

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

    const user = student.userId as any;
    const pdfBuffer = await generateServerPdfFromPayload({
      cardType: 'student-id',
      name: user.name || '',
      idNumber: cardNumber,
      photoUrl: user.avatar || '',
      phone: user.phone || '',
      email: user.email || '',
      stream: [(student.classId as any)?.name, (student.sectionId as any)?.name].filter(Boolean).join(' - '),
      session: `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`,
      institutionName: institution.name || 'LOGO',
      institutionAddress: institution.address || '',
      institutionPhone: institution.phone || '',
      institutionEmail: institution.email || '',
      institutionWebsite: institution.website || '',
      qrData,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cardNumber}.pdf"`);
    return res.send(pdfBuffer);
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

    const pdfBuffer = await generateServerPdfFromPayload({
      cardType: 'teacher-id',
      name: (teacher.userId as any).name || '',
      idNumber: cardNumber,
      photoUrl: (teacher.userId as any).avatar || '',
      qualification: teacher.qualification || teacher.designation || '',
      designation: teacher.designation || '',
      joined: teacher.joiningDate ? moment(teacher.joiningDate).format('MMMM YYYY') : '',
      institutionName: institution.name || 'Institute Logo',
      institutionAddress: institution.address || '',
      institutionPhone: institution.phone || '',
      institutionEmail: institution.email || '',
      institutionWebsite: institution.website || '',
      headName: institution.headName || '',
      qrData,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${cardNumber}.pdf"`);
    return res.send(pdfBuffer);
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

    if (format === 'pdf' && (card.ownerType === 'teacher' || ownerRole === 'teacher' || ownerRole === 'head' || ownerRole === 'assistant_head')) {
      const teacher = await Teacher.findOne({ userId: (card.ownerId as any)._id || card.ownerId, institutionId: (card.institutionId as any)._id }).lean();
      const institution = card.institutionId as any;
      const pdfBuffer = await generateServerPdfFromPayload({
        cardType: 'teacher-id',
        name: (card.ownerId as any).name || '',
        idNumber: card.cardNumber,
        photoUrl: (card as any).photoUrl || (card.ownerId as any).avatar || '',
        qualification: teacher?.qualification || teacher?.designation || '',
        designation: teacher?.designation || '',
        joined: teacher?.joiningDate ? moment(teacher.joiningDate).format('MMMM YYYY') : '',
        institutionName: institution.name || 'Institute Logo',
        institutionAddress: institution.address || '',
        institutionPhone: institution.phone || '',
        institutionEmail: institution.email || '',
        institutionWebsite: institution.website || '',
        headName: institution.headName || '',
        qrData: card.qrCodeData || `easy_school://idcard/${card.cardNumber}`,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`);
      return res.send(pdfBuffer);
    }

    if (format === 'pdf' && card.ownerType === 'student') {
      const student = await Student.findOne({ userId: (card.ownerId as any)._id || card.ownerId, institutionId: (card.institutionId as any)._id })
        .populate('classId', 'name grade')
        .populate('sectionId', 'name')
        .lean();
      const institution = card.institutionId as any;
      const owner = card.ownerId as any;
      const pdfBuffer = await generateServerPdfFromPayload({
        cardType: 'student-id',
        name: owner.name || '',
        idNumber: card.cardNumber,
        photoUrl: (card as any).photoUrl || owner.avatar || '',
        phone: owner.phone || '',
        email: owner.email || '',
        stream: [(student?.classId as any)?.name, (student?.sectionId as any)?.name].filter(Boolean).join(' - '),
        session: `${new Date(card.validityStart || card.issuedAt || new Date()).getFullYear()} - ${new Date(card.validityEnd || new Date()).getFullYear()}`,
        institutionName: institution.name || 'LOGO',
        institutionAddress: institution.address || '',
        institutionPhone: institution.phone || '',
        institutionEmail: institution.email || '',
        institutionWebsite: institution.website || '',
        qrData: card.qrCodeData || `easy_school://idcard/${card.cardNumber}`,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${card.cardNumber}.pdf"`);
      return res.send(pdfBuffer);
    }

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
