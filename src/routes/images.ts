import express from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth';
import { deleteImageById, getImageFile, openImageDownloadStream, storeImage } from '../services/gridFsImageService';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/:id', async (req, res) => {
  try {
    const file = await getImageFile(req.params.id);
    if (!file) return res.status(404).json({ message: 'Image not found' });
    if (file.contentType) res.setHeader('Content-Type', file.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return openImageDownloadStream(req.params.id).pipe(res);
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load image', error });
  }
});

router.post('/upload', authenticate, upload.single('image'), async (req: any, res) => {
  try {
    const image = await storeImage(req.file, {
      category: req.body?.category || 'general',
      institutionId: String(req.user?.institutionId || ''),
      uploadedBy: String(req.user?._id || req.user?.id || ''),
    });
    return res.status(201).json(image);
  } catch (error: any) {
    return res.status(error?.statusCode || 500).json({ message: error?.message || 'Failed to upload image', error });
  }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    const deleted = await deleteImageById(req.params.id);
    return res.json({ deleted });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to delete image', error });
  }
});

export default router;
