import mongoose, { Types } from 'mongoose';
import QRCode from 'qrcode';
import { randomUUID } from 'crypto';
import Book, { IBook } from '../models/Book';
import Loan from '../models/Loan';

const DEFAULT_FINE_PER_DAY = Number(process.env.LIBRARY_FINE_PER_DAY || '10');
const asObjectId = (value: any) => (typeof value === 'string' && mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value);

const attachBookQrCode = async (book: any) => {
  if (!book) return book;
  const payload = JSON.stringify({ type: 'library-book', bookId: String(book._id), qrCodeValue: book.qrCodeValue, title: book.title });
  const qrCodeDataUrl = await QRCode.toDataURL(payload, { margin: 1, width: 220, errorCorrectionLevel: 'M' });
  const plain = typeof book.toObject === 'function' ? book.toObject() : book;
  return { ...plain, qrCodeDataUrl };
};

const buildBookQuery = (query: any = {}, institutionId?: any) => {
  const filter: any = { institutionId };
  if (query.search) {
    const rx = new RegExp(String(query.search).trim(), 'i');
    filter.$or = [{ title: rx }, { author: rx }, { isbn: rx }, { category: rx }, { tags: rx }];
  }
  if (query.category) filter.category = String(query.category);
  if (query.status) filter.status = String(query.status);
  if (query.available === 'true') filter.copiesAvailable = { $gt: 0 };
  return filter;
};

export const createBook = async (data: Partial<IBook>, userId?: Types.ObjectId, institutionId?: Types.ObjectId) => {
  const total = Math.max(0, Number(data.copiesTotal ?? 1));
  const available = Math.max(0, Math.min(total, Number(data.copiesAvailable ?? total)));
  const book = new Book({
    ...data,
    copiesTotal: total,
    copiesAvailable: available,
    status: available > 0 ? 'available' : 'unavailable',
    qrCodeValue: data.qrCodeValue || `LIB-${randomUUID()}`,
    institutionId,
    createdBy: userId,
  });
  return attachBookQrCode(await book.save());
};

export const updateBook = async (id: string, data: Partial<IBook>, institutionId?: Types.ObjectId) => {
  const payload: any = { ...data };
  if (payload.copiesTotal !== undefined) payload.copiesTotal = Math.max(0, Number(payload.copiesTotal));
  if (payload.copiesAvailable !== undefined) payload.copiesAvailable = Math.max(0, Number(payload.copiesAvailable));
  if (payload.copiesTotal !== undefined && payload.copiesAvailable !== undefined) payload.copiesAvailable = Math.min(payload.copiesAvailable, payload.copiesTotal);
  const book = await Book.findOneAndUpdate({ _id: id, institutionId }, payload, { new: true });
  return attachBookQrCode(book);
};

export const listBooks = async (query: any = {}, institutionId?: Types.ObjectId) => {
  const books = await Book.find(buildBookQuery(query, institutionId)).sort({ title: 1 });
  return Promise.all(books.map((book) => attachBookQrCode(book)));
};

export const getBook = async (id: string, institutionId?: Types.ObjectId) => attachBookQrCode(await Book.findOne({ _id: id, institutionId }));
export const deleteBook = async (id: string, institutionId?: Types.ObjectId) => Book.findOneAndDelete({ _id: id, institutionId });

export const issueBook = async (bookId: string, userId: string, issuedBy: string | undefined, institutionId: Types.ObjectId | undefined, days = 14) => {
  const book = await Book.findOne({ _id: bookId, institutionId });
  if (!book) throw new Error('Book not found');
  if (book.copiesAvailable <= 0) throw new Error('No copies available');
  book.copiesAvailable = Math.max(0, book.copiesAvailable - 1);
  if (book.copiesAvailable <= 0) book.status = 'unavailable';
  await book.save();
  const issuedAt = new Date();
  const dueDate = new Date(issuedAt.getTime() + Number(days || 14) * 24 * 60 * 60 * 1000);
  return new Loan({ book: book._id, user: userId, issuedBy, issuedAt, dueDate, status: 'issued', institutionId }).save();
};

export const returnBook = async (loanId: string, institutionId?: Types.ObjectId) => {
  const loan = await Loan.findOne({ _id: loanId, institutionId }).populate('book');
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'returned') throw new Error('Book already returned');
  const now = new Date();
  loan.returnedAt = now;
  const overdueDays = now > loan.dueDate ? Math.ceil((now.getTime() - loan.dueDate.getTime()) / (24 * 60 * 60 * 1000)) : 0;
  loan.fine = overdueDays * DEFAULT_FINE_PER_DAY;
  loan.status = overdueDays > 0 ? 'overdue' : 'returned';
  await loan.save();
  if (loan.book) {
    const book = await Book.findOne({ _id: (loan.book as any)._id || loan.book, institutionId });
    if (book) {
      book.copiesAvailable = Math.min(book.copiesTotal, (book.copiesAvailable || 0) + 1);
      if (book.copiesAvailable > 0 && book.status !== 'archived') book.status = 'available';
      await book.save();
    }
  }
  return loan;
};

export const listLoans = async (query: any = {}, institutionId?: Types.ObjectId) => {
  const filter: any = { institutionId };
  if (query.user) filter.user = query.user;
  if (query.userIds) filter.user = { $in: query.userIds };
  if (query.book) filter.book = query.book;
  if (query.status) filter.status = query.status;
  return Loan.find(filter).populate('book user issuedBy').sort({ issuedAt: -1 });
};

export const getLoan = async (id: string, institutionId?: Types.ObjectId) => Loan.findOne({ _id: id, institutionId }).populate('book user issuedBy');

export const listCategories = async (institutionId?: Types.ObjectId) => {
  const categories = await Book.aggregate([
    { $match: { institutionId: asObjectId(institutionId) } },
    { $group: { _id: '$category', count: { $sum: 1 }, available: { $sum: '$copiesAvailable' }, total: { $sum: '$copiesTotal' } } },
    { $sort: { _id: 1 } },
  ]);
  return categories.filter((item) => item._id).map((item) => ({ name: item._id, count: item.count, available: item.available, total: item.total }));
};
