import { Request, Response } from 'express';
import * as libSvc from '../services/libraryService';
import Book from '../models/Book';
import Student from '../models/Student';
import Parent from '../models/Parent';

const managerRoles = ['head', 'assistant_head', 'admin', 'super_admin', 'librarian'];
const teacherRoles = ['teacher', 'class_teacher', 'subject_teacher'];
const viewRoles = [...managerRoles, ...teacherRoles, 'finance_officer', 'staff', 'student', 'parent'];
const normalizeRole = (role?: string) => {
  const normalized = String(role || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (normalized === 'guardian' || normalized === 'parent_guardian') return 'parent';
  if (normalized === 'library' || normalized === 'library_admin') return 'librarian';
  return normalized;
};
const canManageLibrary = (role?: string) => managerRoles.includes(normalizeRole(role));
const canViewLibrary = (role?: string) => viewRoles.includes(normalizeRole(role));

const institutionQuery = (req: any) => ({ institutionId: req.user?.institutionId });

const scopedBookQuery = (req: any) => {
  const role = normalizeRole(req.user?.role);
  const query: any = { ...institutionQuery(req) };
  const search = String(req.query?.search || '').trim();
  const category = String(req.query?.category || '').trim();
  const status = String(req.query?.status || '').trim();

  if (search) {
    const rx = new RegExp(search, 'i');
    query.$or = [{ title: rx }, { author: rx }, { isbn: rx }, { category: rx }, { publisher: rx }];
  }
  if (category) query.category = category;

  if (!canManageLibrary(role)) {
    query.status = { $ne: 'archived' };
    if (role === 'student' || role === 'parent') query.copiesAvailable = { $gt: 0 };
    return query;
  }

  if (status === 'available') {
    query.status = { $ne: 'archived' };
    query.copiesAvailable = { $gt: 0 };
  } else if (status === 'unavailable') {
    query.status = { $ne: 'archived' };
    query.copiesAvailable = { $lte: 0 };
  } else if (status === 'archived') {
    query.status = 'archived';
  }
  return query;
};

const linkedChildScope = async (req: any) => {
  const parent = await Parent.findOne({ institutionId: req.user.institutionId, userId: req.user._id }).select('children').lean();
  const students = await Student.find({ institutionId: req.user.institutionId, _id: { $in: parent?.children || [] }, isActive: { $ne: false } }).select('_id userId').lean();
  return { studentIds: students.map((student: any) => student._id), userIds: students.map((student: any) => student.userId).filter(Boolean) };
};

const scopedLoanQuery = async (req: any) => {
  const role = normalizeRole(req.user?.role);
  const query: any = { ...institutionQuery(req) };
  if (req.query?.status) query.status = req.query.status;
  if (req.query?.bookId) query.book = req.query.bookId;
  if (role === 'student' || teacherRoles.includes(role) || role === 'staff' || role === 'finance_officer') query.user = req.user._id || req.user.id;
  else if (role === 'parent') {
    const scope = await linkedChildScope(req);
    query.$or = [{ user: { $in: scope.userIds } }, { studentId: { $in: scope.studentIds } }];
  }
  return query;
};

const assertManager = (req: any, res: Response) => {
  if (canManageLibrary(req.user?.role)) return true;
  res.status(403).json({ message: 'Access denied. Only Head/Assistant Head/Admin/Super Admin/Librarian can manage library records.' });
  return false;
};

export const createBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!assertManager(request, res)) return;
  const userId = request.user?._id || request.user?.id;
  const book = await libSvc.createBook({ ...req.body, institutionId: request.user?.institutionId }, userId);
  res.status(201).json(book);
};

export const updateBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!assertManager(request, res)) return;
  const book = await libSvc.updateBook(req.params.id, { ...req.body, institutionId: request.user?.institutionId }, institutionQuery(request));
  if (!book) return res.status(404).json({ message: 'Book not found' });
  res.json(book);
};

export const listBooks = async (req: Request, res: Response) => {
  const request: any = req;
  if (!canViewLibrary(request.user?.role)) return res.status(403).json({ message: 'Access denied.' });
  const books = await libSvc.listBooks(scopedBookQuery(request));
  res.json(books);
};

export const getBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!canViewLibrary(request.user?.role)) return res.status(403).json({ message: 'Access denied.' });
  const query: any = { _id: req.params.id, ...institutionQuery(request) };
  if (!canManageLibrary(request.user?.role)) query.status = { $ne: 'archived' };
  const book = await libSvc.getBook(query);
  if (!book) return res.status(404).json({ message: 'Book not found' });
  res.json(book);
};

export const deleteBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!assertManager(request, res)) return;
  const book = await libSvc.deleteBook(req.params.id, institutionQuery(request));
  if (!book) return res.status(404).json({ message: 'Book not found' });
  res.json({ success: true, book });
};

export const getCategories = async (req: Request, res: Response) => {
  const request: any = req;
  if (!canViewLibrary(request.user?.role)) return res.status(403).json({ message: 'Access denied.' });
  const query = scopedBookQuery(request);
  delete query.category;
  const categories = await Book.aggregate([
    { $match: query },
    { $group: { _id: { $ifNull: ['$category', 'Uncategorized'] }, total: { $sum: '$copiesTotal' }, available: { $sum: '$copiesAvailable' }, titles: { $sum: 1 } } },
    { $sort: { _id: 1 } },
    { $project: { _id: 0, name: '$_id', total: 1, available: 1, titles: 1 } },
  ]);
  res.json(categories);
};

export const issueBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!assertManager(request, res)) return;
  const { bookId, userId, studentId, days } = req.body;
  const issued = await libSvc.issueBook(bookId, userId, request.user?._id || request.user?.id, days, request.user?.institutionId, studentId);
  res.json(issued);
};

export const returnBook = async (req: Request, res: Response) => {
  const request: any = req;
  if (!assertManager(request, res)) return;
  const { loanId } = req.body;
  const ret = await libSvc.returnBook(loanId, institutionQuery(request));
  res.json(ret);
};

export const listLoans = async (req: Request, res: Response) => {
  const request: any = req;
  if (!canViewLibrary(request.user?.role)) return res.status(403).json({ message: 'Access denied.' });
  const loans = await libSvc.listLoans(await scopedLoanQuery(request));
  res.json(loans);
};

export const getLoan = async (req: Request, res: Response) => {
  const request: any = req;
  if (!canViewLibrary(request.user?.role)) return res.status(403).json({ message: 'Access denied.' });
  const query: any = { _id: req.params.id, ...(await scopedLoanQuery(request)) };
  const loan = await libSvc.getLoan(query);
  if (!loan) return res.status(404).json({ message: 'Loan not found' });
  res.json(loan);
};
