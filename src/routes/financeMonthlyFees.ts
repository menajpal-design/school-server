import express from 'express';

const router = express.Router();

router.get('/class-fee-structures/ping', (_req, res) => {
  res.json({ ok: true });
});

export default router;
