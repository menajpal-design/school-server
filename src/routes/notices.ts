import express from 'express';
import { authenticate, canPostNotice } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import DocumentModel from '../models/Document';
import Notice from '../models/Notice';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Notice.find({ institutionId: req.user.institutionId })
    .populate('postedBy', 'name email role')
    .sort({ publishedAt: -1, createdAt: -1 })
    .then((notices) => res.json({ notices }))
    .catch((error) => res.status(500).json({ message: 'Failed to load notices', error }));
});

router.get('/:id', authenticate, (req, res) => {
  Notice.findOne({ _id: req.params.id, institutionId: req.user.institutionId })
    .populate('postedBy', 'name email role')
    .populate('attachments')
    .then((notice) => {
      if (!notice) return res.status(404).json({ message: 'Notice not found' });
      res.json({ notice });
    })
    .catch((error) => res.status(500).json({ message: 'Failed to load notice', error }));
});

router.post('/', authenticate, canPostNotice(), uploadSingle('attachment'), async (req, res) => {
  try {
    let attachments = req.body.attachments || [];
    if (!Array.isArray(attachments)) attachments = attachments ? [attachments] : [];

    if (req.file) {
      const document = await DocumentModel.create({
        title: req.file.originalname,
        type: 'other',
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        isPublic: true,
        tags: ['notice-attachment'],
        uploadedBy: req.user._id,
        institutionId: req.user.institutionId,
      });
      attachments.push(document._id);
    }

    const targetRoles = Array.isArray(req.body.targetRoles)
      ? req.body.targetRoles
      : String(req.body.targetAudience || req.body.targetRoles || 'all').split(',').map((item) => item.trim()).filter(Boolean);

    const notice = await Notice.create({
      title: req.body.title,
      content: req.body.content,
      category: req.body.category || 'general',
      priority: req.body.priority || 'medium',
      urgent: req.body.urgent === true || req.body.urgent === 'true' || req.body.priority === 'high' || req.body.category === 'urgent',
      targetAudience: req.body.targetAudience || 'all',
      targetRoles,
      targetClasses: req.body.targetClasses || [],
      attachments,
      isPublished: req.body.schedulePublish === 'true' || req.body.schedulePublish === true ? false : req.body.isPublished !== 'false',
      publishedAt: req.body.publishedAt ? new Date(req.body.publishedAt) : new Date(),
      expiryDate: req.body.expiryDate ? new Date(req.body.expiryDate) : undefined,
      postedBy: req.user._id,
      institutionId: req.user.institutionId,
    });
    res.status(201).json({ notice });
  } catch (error) {
    res.status(500).json({ message: 'Failed to post notice', error });
  }
});

router.put('/:id', authenticate, canPostNotice(), uploadSingle('attachment'), async (req, res) => {
  try {
    const notice = await Notice.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!notice) return res.status(404).json({ message: 'Notice not found' });
    if (req.file) {
      const document = await DocumentModel.create({
        title: req.file.originalname,
        type: 'notice',
        ownerType: 'notice',
        ownerId: notice._id,
        fileUrl: `/uploads/${req.file.filename}`,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        isPublic: true,
        tags: ['notice-attachment'],
        uploadedBy: req.user._id,
        institutionId: req.user.institutionId,
      });
      notice.attachments = [...(notice.attachments || []), document._id as any] as any;
    }
    notice.title = req.body.title || notice.title;
    notice.content = req.body.content || notice.content;
    notice.category = req.body.category || notice.category;
    notice.priority = req.body.priority || notice.priority;
    notice.urgent = req.body.urgent === true || req.body.urgent === 'true' || notice.priority === 'high' || notice.category === 'urgent';
    notice.targetAudience = req.body.targetAudience || notice.targetAudience;
    notice.targetRoles = req.body.targetRoles || notice.targetRoles;
    notice.isPublished = req.body.isPublished !== undefined ? req.body.isPublished === true || req.body.isPublished === 'true' : notice.isPublished;
    notice.publishedAt = req.body.publishedAt ? new Date(req.body.publishedAt) : notice.publishedAt;
    notice.expiryDate = req.body.expiryDate ? new Date(req.body.expiryDate) : notice.expiryDate;
    await notice.save();
    res.json({ notice });
  } catch (error) {
    res.status(500).json({ message: 'Failed to update notice', error });
  }
});

router.delete('/:id', authenticate, canPostNotice(), async (req, res) => {
  try {
    const notice = await Notice.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!notice) return res.status(404).json({ message: 'Notice not found' });
    await notice.deleteOne();
    res.json({ message: 'Notice deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete notice', error });
  }
});

export default router;
