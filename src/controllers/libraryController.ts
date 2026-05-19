import { Request, Response } from 'express';
import * as libSvc from '../services/libraryService';

export const createBook = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  const book = await libSvc.createBook(req.body, userId);
  res.json(book);
};

export const updateBook = async (req: Request, res: Response) => {
  const book = await libSvc.updateBook(req.params.id, req.body);
  res.json(book);
};

export const listBooks = async (req: Request, res: Response) => {
  const books = await libSvc.listBooks(req.query || {});
  res.json(books);
};

export const getBook = async (req: Request, res: Response) => {
  const book = await libSvc.getBook(req.params.id);
  res.json(book);
};

export const deleteBook = async (req: Request, res: Response) => {
  const book = await libSvc.deleteBook(req.params.id);
  res.json({ success: true, book });
};

export const issueBook = async (req: Request, res: Response) => {
  const { bookId, userId, days } = req.body;
  const issued = await libSvc.issueBook(bookId, userId, req.user?.id, days);
  res.json(issued);
};

export const returnBook = async (req: Request, res: Response) => {
  const { loanId } = req.body;
  const ret = await libSvc.returnBook(loanId);
  res.json(ret);
};

export const listLoans = async (req: Request, res: Response) => {
  const loans = await libSvc.listLoans(req.query || {});
  res.json(loans);
};

export const getLoan = async (req: Request, res: Response) => {
  const loan = await libSvc.getLoan(req.params.id);
  res.json(loan);
};
