import { GridFSBucket, ObjectId } from 'mongodb';
import mongoose from 'mongoose';

const MIN_IMAGE_SIZE = 50 * 1024;
const MAX_IMAGE_SIZE = 500 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export type StoredImage = {
  fileId: string;
  filename: string;
  url: string;
  size: number;
  contentType: string;
};

const bucket = () => new GridFSBucket(mongoose.connection.db, { bucketName: 'images' });

export const isValidImageId = (value: string) => ObjectId.isValid(value);

export const imageUrlForId = (fileId: string) => `/api/images/${fileId}`;

export const extractImageId = (value?: string | null) => {
  if (!value) return '';
  const match = String(value).match(/\/api\/images\/([a-f0-9]{24})/i);
  return match?.[1] || (ObjectId.isValid(String(value)) ? String(value) : '');
};

export async function uploadToImgBB(
  file: Express.Multer.File,
  apiKey?: string
): Promise<{ url: string; deleteUrl?: string } | null> {
  const key = (apiKey || process.env.IMGBB_API_KEY || '').trim();
  if (!key) return null;

  try {
    const formData = new FormData();
    formData.append('image', file.buffer.toString('base64'));

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${key}`, {
      method: 'POST',
      body: formData,
    });

    const data: any = await response.json();
    if (data && data.success && data.data?.url) {
      console.log(`[ImgBB] Successfully uploaded image: ${data.data.url}`);
      return {
        url: data.data.url,
        deleteUrl: data.data.delete_url,
      };
    } else {
      console.warn('[ImgBB] Upload response:', data?.error || data);
      return null;
    }
  } catch (error: any) {
    console.error('[ImgBB] Network error during upload:', error.message || error);
    return null;
  }
}

export async function storeImage(
  file: Express.Multer.File,
  metadata: Record<string, any> = {}
): Promise<StoredImage> {
  if (!file) {
    const err: any = new Error('Image file is required.');
    err.statusCode = 400;
    throw err;
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.mimetype)) {
    const err: any = new Error('Only JPG, PNG and WebP images are allowed.');
    err.statusCode = 400;
    throw err;
  }
  if (file.size > MAX_IMAGE_SIZE) {
    const err: any = new Error('Image must be 500KB or smaller.');
    err.statusCode = 400;
    throw err;
  }
  if (file.size < MIN_IMAGE_SIZE) {
    const err: any = new Error('Image must be at least 50KB.');
    err.statusCode = 400;
    throw err;
  }

  const extension = file.originalname?.split('.').pop()?.toLowerCase() || 'img';
  const safeBase = (file.originalname || 'image')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const filename = `${safeBase}-${Date.now()}.${extension}`;

  // 1. Try ImgBB if API key is provided in metadata or environment
  const imgbbKey = (metadata?.imgbbApiKey || process.env.IMGBB_API_KEY || '').trim();
  if (imgbbKey) {
    const imgbbResult = await uploadToImgBB(file, imgbbKey);
    if (imgbbResult?.url) {
      return {
        fileId: `imgbb-${Date.now()}`,
        filename,
        url: imgbbResult.url,
        size: file.size,
        contentType: file.mimetype,
      };
    }
    console.warn('[ImageService] Falling back to MongoDB GridFS because ImgBB upload was unsuccessful.');
  }
  const uploadStream = bucket().openUploadStream(filename, {
    contentType: file.mimetype,
    metadata: {
      ...metadata,
      originalName: file.originalname,
      size: file.size,
      uploadedAt: new Date(),
    },
  });

  await new Promise<void>((resolve, reject) => {
    uploadStream.once('finish', () => resolve());
    uploadStream.once('error', reject);
    uploadStream.end(file.buffer);
  });

  const fileId = String(uploadStream.id);
  return {
    fileId,
    filename,
    url: imageUrlForId(fileId),
    size: file.size,
    contentType: file.mimetype,
  };
}

export async function getImageFile(fileId: string) {
  if (!ObjectId.isValid(fileId)) return null;
  const files = await bucket().find({ _id: new ObjectId(fileId) }).limit(1).toArray();
  return files[0] || null;
}

export function openImageDownloadStream(fileId: string) {
  return bucket().openDownloadStream(new ObjectId(fileId));
}

export async function deleteImageById(fileId: string) {
  if (!fileId || fileId.startsWith('imgbb-')) return true;
  if (!ObjectId.isValid(fileId)) return false;
  try {
    await bucket().delete(new ObjectId(fileId));
    return true;
  } catch (error: any) {
    if (error?.message?.toLowerCase?.().includes('file not found')) return false;
    throw error;
  }
}
