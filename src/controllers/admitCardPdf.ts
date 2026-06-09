import { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

const text = (value: any) => String(value || '').replace(/\s+/g, ' ').trim();
const short = (value: any, max = 70) => { const v = text(value); return v.length > max ? `${v.slice(0, max - 1)}…` : v; };
const dateText = (value: any) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value).split('T')[0];
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const moneyName = (value: any) => text(value) || '-';
const sanitizeFilename = (value: string) => text(value).replace(/[^a-z0-9-_]+/gi, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'admit-card';

function drawRoundRect(doc: PDFKit.PDFDocument, x: number, y: number, w: number, h: number, r = 10, fill?: string, stroke?: string) {
  doc.save();
  doc.roundedRect(x, y, w, h, r);
  if (fill && stroke) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke) doc.stroke(stroke);
  doc.restore();
}

function labelValue(doc: PDFKit.PDFDocument, x: number, y: number, label: string, value: string, width = 280) {
  doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text(label.toUpperCase(), x, y, { width: 78, continued: false });
  doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(value || '-', x + 78, y - 1, { width: width - 78, height: 12, ellipsis: true });
  doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(x, y + 15).lineTo(x + width, y + 15).stroke();
}

async function imageBufferFromUrl(url?: string) {
  try {
    if (!url || !/^https?:\/\//i.test(url)) return null;
    const res = await fetch(url);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch { return null; }
}

async function qrBufferFromPayload(payload: string) {
  try {
    return await QRCode.toBuffer(payload || '-', {
      type: 'png',
      width: 360,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    return null;
  }
}

function drawQrFallback(doc: PDFKit.PDFDocument, x: number, y: number, size: number) {
  doc.save();
  doc.rect(x, y, size, size).fill('#ffffff').stroke('#cbd5e1');
  doc.fillColor('#0f172a').fontSize(7).font('Helvetica-Bold').text('QR', x, y + size / 2 - 8, { width: size, align: 'center' });
  doc.fillColor('#64748b').fontSize(5).font('Helvetica').text('VERIFY', x, y + size / 2 + 3, { width: size, align: 'center' });
  doc.restore();
}

export const renderServerAdmitCardPdf = async (req: Request, res: Response) => {
  try {
    const body: any = req.body || {};
    const student = body.student || {};
    const institution = body.institution || {};
    const exam = body.exam || {};
    const rows = Array.isArray(body.examRows) && body.examRows.length ? body.examRows.slice(0, 7) : [{ courseCode: exam.name || 'Exam', examDate: dateText(exam.date || exam.startDate), examTime: exam.duration || '', examCentre: institution.address || '' }];
    const name = moneyName(student.name || student.studentName || student.userId?.name);
    const roll = moneyName(student.rollNumber || student.admissionNumber || student.registrationNumber || student.idNumber);
    const institutionName = moneyName(institution.name || 'Institution');
    const center = moneyName(exam.center || exam.examCenter || institution.address || body.examCenter);
    const qrPayload = body.qrData || JSON.stringify({ type: 'admit-card', name, roll, exam: exam.name || body.examName, institution: institutionName, host: req.get('host') });
    const qrBuffer = await qrBufferFromPayload(qrPayload);
    const logoBuffer = await imageBufferFromUrl(institution.logo || institution.logoUrl);
    const photoBuffer = await imageBufferFromUrl(student.photoUrl || student.avatar || student.userId?.avatar);
    const sealBuffer = await imageBufferFromUrl(institution.seal);
    const signBuffer = await imageBufferFromUrl(institution.headSignature);

    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 18, bufferPages: false });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${sanitizeFilename(`admit-card-${roll}`)}.pdf"`);
      res.setHeader('Content-Length', String(pdf.length));
      res.send(pdf);
    });

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const x0 = 24;
    const y0 = 24;
    const w = pageW - 48;
    const h = pageH - 48;

    drawRoundRect(doc, x0, y0, w, h, 18, '#ffffff', '#cbd5e1');
    doc.rect(x0, y0, w, 8).fill('#0f766e');
    doc.rect(x0 + w - 170, y0, 170, 8).fill('#f59e0b');

    const logoX = x0 + 18, headerY = y0 + 20;
    drawRoundRect(doc, logoX, headerY, 58, 58, 12, '#ffffff', '#cbd5e1');
    if (logoBuffer) doc.image(logoBuffer, logoX + 7, headerY + 7, { width: 44, height: 44, fit: [44, 44] });
    else doc.fillColor('#0f766e').fontSize(18).font('Helvetica-Bold').text('ES', logoX + 16, headerY + 20);

    doc.fillColor('#047857').fontSize(8).font('Helvetica-Bold').text('OFFICIAL ADMIT CARD', x0, headerY + 2, { width: w, align: 'center', characterSpacing: 2 });
    doc.fillColor('#0f172a').fontSize(22).font('Helvetica-Bold').text(institutionName, x0 + 95, headerY + 18, { width: w - 190, align: 'center', ellipsis: true });
    doc.fillColor('#475569').fontSize(8).font('Helvetica').text(short(institution.address, 92), x0 + 105, headerY + 45, { width: w - 210, align: 'center' });
    doc.fillColor('#64748b').fontSize(7).text([institution.phone, institution.email].filter(Boolean).join(' | '), x0 + 105, headerY + 58, { width: w - 210, align: 'center' });
    const qrBoxX = x0 + w - 82;
    const qrBoxY = headerY - 2;
    const qrBoxSize = 66;
    drawRoundRect(doc, qrBoxX, qrBoxY, qrBoxSize, qrBoxSize, 10, '#ffffff', '#cbd5e1');
    if (qrBuffer) doc.image(qrBuffer, qrBoxX + 6, qrBoxY + 6, { width: 54, height: 54, fit: [54, 54] });
    else drawQrFallback(doc, qrBoxX + 8, qrBoxY + 8, 50);
    doc.fillColor('#64748b').fontSize(6).font('Helvetica-Bold').text('VERIFY QR', qrBoxX, qrBoxY + qrBoxSize + 3, { width: qrBoxSize, align: 'center' });

    const examY = y0 + 96;
    drawRoundRect(doc, x0 + 18, examY, w - 165, 52, 12, '#0f172a');
    doc.fillColor('#a7f3d0').fontSize(8).font('Helvetica-Bold').text('EXAMINATION', x0 + 30, examY + 12, { characterSpacing: 2 });
    doc.fillColor('#ffffff').fontSize(15).font('Helvetica-Bold').text(short(exam.name || body.examName || 'Admit Card', 72), x0 + 30, examY + 29, { width: w - 190, ellipsis: true });
    drawRoundRect(doc, x0 + w - 132, examY, 112, 52, 12, '#f8fafc', '#cbd5e1');
    doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('CENTER CODE', x0 + w - 118, examY + 13, { characterSpacing: 1.2 });
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text(exam.centerCode || body.centerCode || '-', x0 + w - 118, examY + 30, { width: 90, ellipsis: true });

    const bodyY = y0 + 162;
    const infoW = 338;
    const photoW = 112;
    const centerW = w - 18 - infoW - photoW - 24 - 18;
    drawRoundRect(doc, x0 + 18, bodyY, infoW, 155, 12, '#ffffff', '#e2e8f0');
    doc.fillColor('#0f766e').fontSize(8).font('Helvetica-Bold').text('CANDIDATE INFORMATION', x0 + 30, bodyY + 12, { characterSpacing: 2 });
    labelValue(doc, x0 + 30, bodyY + 32, 'Name', name, infoW - 24);
    labelValue(doc, x0 + 30, bodyY + 52, 'Roll / ID', roll, infoW - 24);
    labelValue(doc, x0 + 30, bodyY + 72, 'Class / Group', moneyName(student.className || student.stream || body.stream), infoW - 24);
    labelValue(doc, x0 + 30, bodyY + 92, 'Date of Birth', dateText(student.dateOfBirth || student.dob), infoW - 24);
    labelValue(doc, x0 + 30, bodyY + 112, 'Father', moneyName(student.fatherName), infoW - 24);
    labelValue(doc, x0 + 30, bodyY + 132, 'Mother', moneyName(student.motherName), infoW - 24);

    const photoX = x0 + 18 + infoW + 12;
    drawRoundRect(doc, photoX, bodyY, photoW, 155, 12, '#f8fafc', '#e2e8f0');
    doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('CANDIDATE PHOTO', photoX, bodyY + 12, { width: photoW, align: 'center', characterSpacing: 1 });
    drawRoundRect(doc, photoX + 21, bodyY + 32, 70, 90, 8, '#e2e8f0', '#cbd5e1');
    if (photoBuffer) doc.image(photoBuffer, photoX + 21, bodyY + 32, { width: 70, height: 90, fit: [70, 90] });
    else doc.fillColor('#94a3b8').fontSize(10).text('PHOTO', photoX + 21, bodyY + 72, { width: 70, align: 'center' });
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text(`Roll: ${roll}`, photoX + 8, bodyY + 131, { width: photoW - 16, align: 'center', ellipsis: true });

    const centerX = photoX + photoW + 12;
    drawRoundRect(doc, centerX, bodyY, centerW, 155, 12, '#ffffff', '#e2e8f0');
    doc.fillColor('#0f766e').fontSize(8).font('Helvetica-Bold').text('EXAM CENTER', centerX + 14, bodyY + 12, { characterSpacing: 2 });
    doc.fillColor('#0f172a').fontSize(9).font('Helvetica-Bold').text(short(center, 95), centerX + 14, bodyY + 35, { width: centerW - 28, height: 48 });
    doc.strokeColor('#cbd5e1').moveTo(centerX + 14, bodyY + 92).lineTo(centerX + centerW - 14, bodyY + 92).dash(2, { space: 2 }).stroke().undash();
    doc.fillColor('#64748b').fontSize(7).font('Helvetica-Bold').text('EXAM DATE', centerX + 14, bodyY + 108, { characterSpacing: 1.4 });
    doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold').text(dateText(exam.date || exam.startDate || body.examDate), centerX + 14, bodyY + 126);

    const tableY = y0 + 333;
    const tableH = 142;
    drawRoundRect(doc, x0 + 18, tableY, w - 36, tableH, 8, '#ffffff', '#cbd5e1');
    const col = [36, 300, 90, 80, w - 36 - 36 - 300 - 90 - 80];
    const tableX = x0 + 18;
    let tx = tableX;
    doc.rect(tableX, tableY, w - 36, 24).fill('#0f172a');
    ['SL', 'Subject / Course', 'Exam Date', 'Duration', 'Centre'].forEach((head, i) => { doc.fillColor('#fff').fontSize(8).font('Helvetica-Bold').text(head, tx + 6, tableY + 8, { width: col[i] - 10, align: i === 0 ? 'center' : 'left' }); tx += col[i]; });
    rows.slice(0, 6).forEach((r: any, idx: number) => {
      const y = tableY + 24 + idx * 19;
      doc.rect(tableX, y, w - 36, 19).fill(idx % 2 ? '#f8fafc' : '#ffffff');
      let x = tableX;
      const vals = [String(idx + 1), short(r.courseCode || r.code || '-', 42), short(r.examDate || r.date || dateText(exam.date || exam.startDate), 18), short(r.examTime || r.time || r.duration || '-', 14), short(r.examCentre || r.centreName || r.centre || center, 52)];
      vals.forEach((v, i) => { doc.fillColor('#0f172a').fontSize(7.6).font(i === 1 ? 'Helvetica-Bold' : 'Helvetica').text(v, x + 6, y + 6, { width: col[i] - 10, height: 10, ellipsis: true, align: i === 0 ? 'center' : 'left' }); x += col[i]; });
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(tableX, y).lineTo(tableX + w - 36, y).stroke();
    });

    const footerY = y0 + 492;
    drawRoundRect(doc, x0 + 18, footerY, 345, 66, 12, '#fff7ed', '#fed7aa');
    doc.fillColor('#9a3412').fontSize(8).font('Helvetica-Bold').text('INSTRUCTIONS', x0 + 30, footerY + 10, { characterSpacing: 1.2 });
    doc.fillColor('#475569').fontSize(7.2).font('Helvetica')
      .text('1. Bring this admit card and school ID card to the exam hall.', x0 + 30, footerY + 25)
      .text('2. Mobile phone, smart watch and unauthorized notes are not allowed.', x0 + 30, footerY + 36)
      .text('3. Report to the exam hall at least 20 minutes before exam time.', x0 + 30, footerY + 47);
    const signX = x0 + 410;
    const sealX = x0 + 605;
    if (signBuffer) doc.image(signBuffer, signX + 42, footerY + 4, { width: 80, height: 32, fit: [80, 32] });
    doc.strokeColor('#0f172a').lineWidth(0.8).moveTo(signX, footerY + 43).lineTo(signX + 150, footerY + 43).stroke();
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text(moneyName(institution.headName || body.headName || 'Head Teacher'), signX, footerY + 48, { width: 150, align: 'center', ellipsis: true });
    doc.fillColor('#64748b').fontSize(6).text('AUTHORIZED SIGNATURE', signX, footerY + 59, { width: 150, align: 'center' });
    if (sealBuffer) doc.image(sealBuffer, sealX + 54, footerY + 3, { width: 42, height: 32, fit: [42, 32] });
    else drawRoundRect(doc, sealX + 58, footerY + 2, 34, 24, 10, '#ffffff', '#cbd5e1');
    doc.strokeColor('#0f172a').lineWidth(0.8).moveTo(sealX, footerY + 43).lineTo(sealX + 150, footerY + 43).stroke();
    doc.fillColor('#334155').fontSize(8).font('Helvetica-Bold').text('Office Seal', sealX, footerY + 48, { width: 150, align: 'center' });
    doc.fillColor('#64748b').fontSize(6).text('INSTITUTION VERIFICATION', sealX, footerY + 59, { width: 150, align: 'center' });

    doc.end();
  } catch (error: any) {
    return res.status(500).json({ message: 'Failed to generate server admit card PDF', error: error?.message || String(error) });
  }
};