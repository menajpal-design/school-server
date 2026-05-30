import express from 'express';
import { generateCsrfToken, setCsrfCookie } from '../middlewares/csrf';

const router = express.Router();

// Returns a CSRF token and sets a non-HttpOnly CSRF cookie (double-submit cookie pattern).
router.get('/token', (req, res) => {
  const token = generateCsrfToken();
  setCsrfCookie(res, token);
  res.json({ csrfToken: token });
});

export default router;
