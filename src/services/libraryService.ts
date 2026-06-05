import Book, { IBook } from '../models/Book';
import Loan from '../models/Loan';
import { Types } from 'mongoose';
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';

const DEFAULT_FINE_PER_DAY = Number(process.env.LIBRARY_FINE_PER_DAY || '10');

const buildQrPayload = (book: any) => JSON.stringify({
  type: 'library-book',
  bookId: String(book._id),
  qrCodeValue: book.qrCodeValue,
  title: book.title,
});

const attachBookQrCode = async (book: any) => {
  if (!book) return book;
  const plain = typeof book.toObject === 'function' ? book.toObject() : book;
  const payload = buildQrPayload(plain);
  const qrCodeDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  return { ...plain, qrCodeDataUrl };
};

export const createBook = async (data: Partial<IBook>, userId?: Types.ObjectId | string) => {
  const book = new Book({
    ...data,
    qrCodeValue: data.qrCodeValue || `LIB-${randomUUID()}`,
    createdBy: userId,
  });
  const saved = await book.save();
  return attachBookQrCode(saved);
};

export const updateBook = async (id: string, data: Partial<IBook>, scope: Record<string, any> = {}) => {
  const update = { ...data } as any;
  delete update.institutionId;
  const book = await Book.findOneAndUpdate({ _id: id, ...scope }, update, { new: true });
  return attachBookQrCode(book);
};

export const listBooks = async (query: Record<string, any> = {}) => {
  const books = await Book.find(query).sort({ title: 1 });
  return Promise.all(books.map((book) => attachBookQrCode(book)));
};

export const getBook = async (queryOrId: string | Record<string, any>) => {
  const book = typeof queryOrId === 'string' ? await Book.findById(queryOrId) : await Book.findOne(queryOrId);
  return attachBookQrCode(book);
};

export const deleteBook = async (id: string, scope: Record<string, any> = {}) => {
  return Book.findOneAndDelete({ _id: id, ...scope });
};

export const issueBook = async (bookId: string, userId: string, issuedBy?: string, days = 14, institutionId?: string, studentId?: string) => {
  const book = await Book.findOne({ _id: bookId, institutionId });
  if (!book) throw new Error('Book not found');
  if (book.copiesAvailable <= 0) throw new Error('No copies available');

  book.copiesAvailable = Math.max(0, book.copiesAvailable - 1);
  await book.save();

  const issuedAt = new Date();
  const dueDate = new Date(issuedAt.getTime() + Number(days || 14) * 24 * 60 * 60 * 1000);

  const loan = new Loan({ book: book._id, user: userId, studentId: studentId || undefined, issuedBy, institutionId, issuedAt, dueDate, status: 'issued' });
  return loan.save();
};

export const returnBook = async (loanId: string, scope: Record<string, any> = {}) => {
  const loan = await Loan.findOne({ _id: loanId, ...scope }).populate('book');
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'returned') throw new Error('Book already returned');

  const now = new Date();
  loan.returnedAt = now;
  const due = loan.dueDate;
  let fine = 0;
  if (now > due) {
    const diffDays = Math.ceil((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    fine = diffDays * DEFAULT_FINE_PER_DAY;
  }
  loan.fine = fine;
  loan.status = 'returned';
  await loan.save();

  if (loan.book) {
    const book = await Book.findOne({ _id: (loan.book as any)._id || loan.book, institutionId: scope.institutionId });
    if (book) {
      book.copiesAvailable = Math.min(book.copiesTotal, (book.copiesAvailable || 0) + 1);
      await book.save();
    }
  }
  return loan;
};

export const listLoans = async (query: Record<string, any> = {}) => {
  return Loan.find(query).populate('book user issuedBy studentId').sort({ issuedAt: -1 });
};

export const getLoan = async (queryOrId: string | Record<string, any>) => {
  return (typeof queryOrId === 'string' ? Loan.findById(queryOrId) : Loan.findOne(queryOrId)).populate('book user issuedBy studentId');
};
