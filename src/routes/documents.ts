import express from 'express';
import path from 'path';
import fs from 'fs';
import { authenticate } from '../middleware/auth';
import { uploadSingle } from '../middleware/upload';
import Document from '../models/Document';

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  Document.find({ institutionId: req.user.institutionId })
    .populate('uploadedBy', 'name email role')
    .sort({ createdAt: -1 })
    .then((documents) => res.json({ documents }))
    .catch((error) => res.status(500).json({ message: 'Failed to load documents', error }));
});

router.get('/manage', authenticate, (req, res) => {
  Document.find({ institutionId: req.user.institutionId })
    .populate('uploadedBy', 'name email role')
    .sort({ createdAt: -1 })
    .then((documents) => res.json({ documents }))
    .catch((error) => res.status(500).json({ message: 'Failed to load documents', error }));
});

router.post('/upload', authenticate, uploadSingle('file'), (req, res) => {
  const uploadedFile = req.file;
  const { title, type, fileUrl, fileName, fileSize, mimeType, userId, isPublic, tags } = req.body;
  const normalizedTags = Array.isArray(tags)
    ? tags
    : String(tags || '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);

  Document.create({
    title: title || uploadedFile?.originalname,
    type: type || req.body.documentType || 'other',
    ownerType: req.body.ownerType,
    ownerId: req.body.ownerId || undefined,
    fileUrl: uploadedFile ? `/uploads/${uploadedFile.filename}` : fileUrl,
    fileName: uploadedFile?.originalname || fileName,
    fileSize: uploadedFile?.size || Number(fileSize),
    mimeType: uploadedFile?.mimetype || mimeType,
    userId: userId || undefined,
    isPublic: isPublic === true || isPublic === 'true',
    tags: normalizedTags,
    uploadedBy: req.user._id,
    institutionId: req.user.institutionId,
  })
    .then((document) => res.status(201).json({ document }))
    .catch((error) => res.status(500).json({ message: 'Failed to upload document', error }));
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const document = await Document.findOne({ _id: req.params.id, institutionId: req.user.institutionId });
    if (!document) return res.status(404).json({ message: 'Document not found' });

    if (document.fileUrl?.startsWith('/uploads/')) {
      const filename = path.basename(document.fileUrl);
      const filePath = path.join(process.env.UPLOAD_PATH || 'uploads/', filename);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    await document.deleteOne();
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete document', error });
  }
});

export default router;
