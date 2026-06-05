import { Request, Response } from 'express';
import * as libSvc from '../services/libraryService';
import Student from '../models/Student';
import Parent from '../models/Parent';

const manageRoles = ['head', 'assistant_head', 'admin', 'super_admin', 'librarian', 'staff'];
const teacherRoles = ['teacher', 'class_teacher', 'subject_teacher'];

const canManageLibrary = (role?: string) => manageRoles.includes(role || '');
const isReaderRole = (role?: string) => ['student', 'parent', ...teacherRoles].includes(role || '');
const institutionId = (req: any) => req.user?.institutionId;

const getScopedLoanUserIds = async (req: any) => {
  const role = req.user?.role;
  if (role === 'student' || teacherRoles.includes(role)) return [req.user._id || req.user.id];
  if (role === 'parent') {
    const parent = await Parent.findOne({ institutionId: institutionId(req), userId: req.user._id }).lean();
    const students = await Student.find({ institutionId: institutionId(req), _id: { $in: parent?.children || [] } }).select('userId').lean();
    return students.map((student: any) => student.userId).filter(Boolean);
  }
  return [];
};

export const createBook = async (req: Request, res: Response) => {
  try {
    if (!canManageLibrary((req as any).user?.role)) return res.status(403).json({ message: 'Access denied. You cannot add books.' });
    const book = await libSvc.createBook(req.body, (req as any).user?._id || (req as any).user?.id, institutionId(req));
    res.status(201).json(book);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to create book' });
  }
};

export const updateBook = async (req: Request, res: Response) => {
  try {
    if (!canManageLibrary((req as any).user?.role)) return res.status(403).json({ message: 'Access denied. You cannot edit books.' });
    const book = await libSvc.updateBook(req.params.id, req.body, institutionId(req));
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json(book);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to update book' });
  }
};

export const listBooks = async (req: Request, res: Response) => {
  try {
    const query: any = { ...req.query };
    if (isReaderRole((req as any).user?.role)) query.status = query.status || 'available';
    const books = await libSvc.listBooks(query, institutionId(req));
    res.json(books);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load books' });
  }
};

export const getBook = async (req: Request, res: Response) => {
  try {
    const book = await libSvc.getBook(req.params.id, institutionId(req));
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json(book);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load book' });
  }
};

export const deleteBook = async (req: Request, res: Response) => {
  try {
    if (!canManageLibrary((req as any).user?.role)) return res.status(403).json({ message: 'Access denied. You cannot delete books.' });
    const book = await libSvc.deleteBook(req.params.id, institutionId(req));
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.json({ success: true, book });
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to delete book' });
  }
};

export const issueBook = async (req: Request, res: Response) => {
  try {
    if (!canManageLibrary((req as any).user?.role)) return res.status(403).json({ message: 'Access denied. You cannot issue books.' });
    const { bookId, userId, days } = req.body;
    const issued = await libSvc.issueBook(bookId, userId, (req as any).user?._id || (req as any).user?.id, institutionId(req), days);
    res.json(issued);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to issue book' });
  }
};

export const returnBook = async (req: Request, res: Response) => {
  try {
    if (!canManageLibrary((req as any).user?.role)) return res.status(403).json({ message: 'Access denied. You cannot return books.' });
    const { loanId } = req.body;
    const ret = await libSvc.returnBook(loanId, institutionId(req));
    res.json(ret);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to return book' });
  }
};

export const listLoans = async (req: Request, res: Response) => {
  try {
    const role = (req as any).user?.role;
    const query: any = { ...req.query };
    if (!canManageLibrary(role)) {
      const userIds = await getScopedLoanUserIds(req);
      if (!userIds.length) return res.json([]);
      query.user = { $in: userIds };
    }
    const loans = await libSvc.listLoans(query, institutionId(req));
    res.json(loans);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load loans' });
  }
};

export const getLoan = async (req: Request, res: Response) => {
  try {
    const loan: any = await libSvc.getLoan(req.params.id, institutionId(req));
    if (!loan) return res.status(404).json({ message: 'Loan not found' });
    if (!canManageLibrary((req as any).user?.role)) {
      const userIds = (await getScopedLoanUserIds(req)).map(String);
      if (!userIds.includes(String(loan.user?._id || loan.user))) return res.status(403).json({ message: 'Access denied. You cannot view this loan.' });
    }
    res.json(loan);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load loan' });
  }
};

export const listCategories = async (req: Request, res: Response) => {
  try {
    const categories = await libSvc.listCategories(institutionId(req));
    res.json(categories);
  } catch (error: any) {
    res.status(500).json({ message: error?.message || 'Failed to load categories' });
  }
};
