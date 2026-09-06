/**
 * File Upload Utility
 * Supports local uploads stored on disk and served from /uploads
 */

import fs from 'fs';
import path from 'path';
import { getTenantStorageContext } from '../config/tenantStorage';

const MAX_FILE_SIZE = (parseInt(process.env.UPLOAD_MAX_SIZE_MB || '5') || 5) * 1024 * 1024; // Convert MB to bytes
const ALLOWED_TYPES = (process.env.UPLOAD_ALLOWED_TYPES || 'image/jpeg,image/png,application/pdf').split(',');

interface UploadResponse {
  success: boolean;
  url?: string;
  filename?: string;
  size?: number;
  error?: string;
}

/**
 * Validate file before upload
 */
export const validateFile = (
  filename: string,
  fileSize: number,
  mimeType: string
): { valid: boolean; error?: string } => {
  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return {
      valid: false,
      error: `File size exceeds limit of ${process.env.UPLOAD_MAX_SIZE_MB}MB`,
    };
  }

  // Check MIME type
  if (!ALLOWED_TYPES.includes(mimeType)) {
    return {
      valid: false,
      error: `File type not allowed. Allowed types: ${ALLOWED_TYPES.join(', ')}`,
    };
  }

  return { valid: true };
};

/**
 * Upload file locally
 */
/**
 * Upload file locally
 */
export const uploadFileLocally = async (filePath: string): Promise<UploadResponse> => {
  const filename = path.basename(filePath);
  return uploadLocally(filePath, filename);
};

/**
 * Upload file locally
 */
export const uploadLocally = async (filePath: string, filename: string): Promise<UploadResponse> => {
  try {
    const defaultDir = process.env.VERCEL ? '/tmp/uploads' : './uploads';
    const uploadDir = process.env.VERCEL ? defaultDir : (process.env.UPLOAD_PATH || defaultDir);

    // Create upload directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const timestamp = Date.now();
    const newFilename = `${timestamp}-${filename}`;
    const newPath = path.join(uploadDir, newFilename);

    // Copy file to upload directory
    fs.copyFileSync(filePath, newPath);

    // Get file size
    const stats = fs.statSync(newPath);

    return {
      success: true,
      url: `/uploads/${newFilename}`,
      filename: newFilename,
      size: stats.size,
    };
  } catch (error) {
    console.error('Local upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};

/**
 * Delete uploaded file
 */
export const deleteUploadedFile = async (filename: string): Promise<boolean> => {
  try {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    const filePath = path.join(uploadDir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

/**
 * Get file info
 */
export const getFileInfo = (filename: string): { exists: boolean; size?: number; path?: string } => {
  try {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    const filePath = path.join(uploadDir, filename);

    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      return {
        exists: true,
        size: stats.size,
        path: filePath,
      };
    }
    return { exists: false };
  } catch (error) {
    console.error('Error getting file info:', error);
    return { exists: false };
  }
};

/**
 * Generate file URL
 */
/**
 * Generate file URL
 */
export const getFileUrl = (filename: string): string => {
  return `/uploads/${filename}`;
};
