import express from 'express';
import { authenticate, normalizeRole } from '../middleware/auth';
import OnlineClassResource from '../models/OnlineClassResource';

const router = express.Router();
const modes = ['routine', 'recorded', 'schedule', 'books'];
const viewRoles = ['head', 'assistant_head', 'teacher', 'class_teacher', 'subject_teacher', 'student', 'parent'];
const manageRoles = ['head', 'assistant_head', 'teacher', 'class_teacher', 'subject_teacher'];
const canView = (role: string) => viewRoles.includes(normalizeRole(role));
const canManage = (role: string) => manageRoles.includes(normalizeRole(role));

const sizeKbFromDataUrl = (value?: string) => {
  if (!value) return 0;
  const base64 = String(value).split(',')[1] || '';
  if (!base64) return 0;
  return (base64.length * 3 / 4) / 1024;
};

const cleanBody = (body: any) => {
  const mode = modes.includes(String(body.mode)) ? String(body.mode) : 'routine';
  const thumbnail = String(body.thumbnail || '').trim();
  const thumbnailSizeKb = sizeKbFromDataUrl(thumbnail);
  if (thumbnail && thumbnailSizeKb > 80) {
    const err: any = new Error('Thumbnail must be 80KB or smaller.');
    err.status = 400;
    throw err;
  }
  return {
    mode,
    title: String(body.title || '').trim(),
    className: String(body.className || '').trim(),
    subject: String(body.subject || '').trim(),
    teacher: String(body.teacher || '').trim(),
    date: String(body.date || '').trim(),
    time: String(body.time || '').trim(),
    day: String(body.day || '').trim(),
    link: String(body.link || '').trim(),
    description: String(body.description || '').trim(),
    thumbnail,
    thumbnailSizeKb: Number(thumbnailSizeKb.toFixed(2)),
  };
};

router.get('/', authenticate, async (req: any, res) => {
  try {
    if (!canView(req.user.role)) return res.status(403).json({ message: 'Access denied.' });
    const q: any = { institutionId: req.user.institutionId };
    if (req.query.mode && modes.includes(String(req.query.mode))) q.mode = req.query.mode;
    if (req.query.className) q.className = new RegExp(String(req.query.className), 'i');
    if (req.query.subject) q.subject = new RegExp(String(req.query.subject), 'i');
    const items = await OnlineClassResource.find(q).sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load online class resources', error });
  }
});

router.post('/', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher/head can save online class resources.' });
    const body = cleanBody(req.body || {});
    if (!body.title) return res.status(400).json({ message: 'Title is required.' });
    if (body.mode === 'books' && !body.link) return res.status(400).json({ message: 'Google Drive PDF link is required.' });
    const item = await OnlineClassResource.create({ ...body, createdBy: req.user._id, institutionId: req.user.institutionId });
    return res.status(201).json({ message: 'Online class resource saved.', item });
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message || 'Failed to save online class resource' });
  }
});

router.put('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher/head can update online class resources.' });
    const body = cleanBody(req.body || {});
    if (!body.title) return res.status(400).json({ message: 'Title is required.' });
    if (body.mode === 'books' && !body.link) return res.status(400).json({ message: 'Google Drive PDF link is required.' });
    const item = await OnlineClassResource.findOneAndUpdate({ _id: req.params.id, institutionId: req.user.institutionId }, body, { new: true });
    if (!item) return res.status(404).json({ message: 'Online class resource not found.' });
    return res.json({ message: 'Online class resource updated.', item });
  } catch (error: any) {
    return res.status(error.status || 500).json({ message: error.message || 'Failed to update online class resource' });
  }
});

router.delete('/:id', authenticate, async (req: any, res) => {
  try {
    if (!canManage(req.user.role)) return res.status(403).json({ message: 'Only teacher/head can delete online class resources.' });
    const item = await OnlineClassResource.findOneAndDelete({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!item) return res.status(404).json({ message: 'Online class resource not found.' });
    return res.json({ message: 'Online class resource deleted.' });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete online class resource', error });
  }
});

export default router;
