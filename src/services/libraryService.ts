import Book, { IBook } from '../models/Book';
import Loan, { ILoan } from '../models/Loan';
import { Types } from 'mongoose';

const DEFAULT_FINE_PER_DAY = Number(process.env.LIBRARY_FINE_PER_DAY || '10');

export const createBook = async (data: Partial<IBook>, userId?: Types.ObjectId) => {
  const book = new Book({ ...data, createdBy: userId });
  return book.save();
};

export const updateBook = async (id: string, data: Partial<IBook>) => {
  return Book.findByIdAndUpdate(id, data, { new: true });
};

export const listBooks = async (query = {}) => {
  return Book.find(query).sort({ title: 1 });
};

export const getBook = async (id: string) => {
  return Book.findById(id);
};

export const deleteBook = async (id: string) => {
  return Book.findByIdAndDelete(id);
};

export const issueBook = async (bookId: string, userId: string, issuedBy?: string, days = 14) => {
  const book = await Book.findById(bookId);
  if (!book) throw new Error('Book not found');
  if (book.copiesAvailable <= 0) throw new Error('No copies available');

  book.copiesAvailable = Math.max(0, book.copiesAvailable - 1);
  await book.save();

  const issuedAt = new Date();
  const dueDate = new Date(issuedAt.getTime() + days * 24 * 60 * 60 * 1000);

  const loan = new Loan({ book: book._id, user: userId, issuedBy, issuedAt, dueDate, status: 'issued' });
  return loan.save();
};

export const returnBook = async (loanId: string) => {
  const loan = await Loan.findById(loanId).populate('book');
  if (!loan) throw new Error('Loan not found');
  if (loan.status === 'returned') throw new Error('Book already returned');

  const now = new Date();
  loan.returnedAt = now;

  // Calculate fine
  const due = loan.dueDate;
  let fine = 0;
  if (now > due) {
    const diffDays = Math.ceil((now.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    fine = diffDays * DEFAULT_FINE_PER_DAY;
  }
  loan.fine = fine;
  loan.status = fine > 0 ? 'overdue' : 'returned';
  await loan.save();

  // increase book copies
  if (loan.book) {
    const book = await Book.findById((loan.book as any)._id || loan.book);
    if (book) {
      book.copiesAvailable = Math.min(book.copiesTotal, (book.copiesAvailable || 0) + 1);
      await book.save();
    }
  }

  return loan;
};

export const listLoans = async (query = {}) => {
  return Loan.find(query).populate('book user issuedBy').sort({ issuedAt: -1 });
};

export const getLoan = async (id: string) => {
  return Loan.findById(id).populate('book user issuedBy');
};
