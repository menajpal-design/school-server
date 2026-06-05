import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import * as ctrl from '../controllers/libraryController';

const router = Router();

router.use(authenticate);

// Categories and summaries
router.get('/categories', ctrl.getCategories);

// Books
router.post('/books', ctrl.createBook);
router.get('/books', ctrl.listBooks);
router.get('/books/:id', ctrl.getBook);
router.put('/books/:id', ctrl.updateBook);
router.delete('/books/:id', ctrl.deleteBook);

// Loans
router.post('/loans/issue', ctrl.issueBook);
router.post('/loans/return', ctrl.returnBook);
router.get('/loans', ctrl.listLoans);
router.get('/loans/:id', ctrl.getLoan);

export default router;
