import express from 'express';
import { generateCsrfToken, setCsrfCookie } from '../middlewares/csrf';

const router = express.Router();

// Returns a CSRF token and sets a non-HttpOnly CSRF cookie (double-submit cookie pattern).
router.get('/token', (req, res) => {
  const token = generateCsrfToken();
  // pass request so middleware can detect secure/proxy protocol
  setCsrfCookie(res, token, req as any);
  res.json({ csrfToken: token });
});

export default router;
