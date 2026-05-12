/**
 * File Upload Utility
 * Supports image uploads with IMGBB API
 */

import fs from 'fs';
import path from 'path';

const parseKeyList = (value?: string | null): string[] => {
  if (!value) return [];
  return value
    .split(/[\n,;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
};

const IMGBB_API_KEYS = parseKeyList(process.env.IMGBB_API_KEYS || process.env.IMGBB_API_KEY);
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
 * Upload image to IMGBB
 */
export const uploadToImgBB = async (filePath: string): Promise<UploadResponse> => {
  try {
    if (IMGBB_API_KEYS.length === 0) {
      return {
        success: false,
        error: 'IMGBB_API_KEY or IMGBB_API_KEYS is not configured',
      };
    }

    // Read file
    const fileBuffer = fs.readFileSync(filePath);
    const base64String = fileBuffer.toString('base64');
    const filename = path.basename(filePath);

    for (const apiKey of IMGBB_API_KEYS) {
      try {
        const body = new URLSearchParams({
          key: apiKey,
          image: base64String,
        });

        const response = await fetch('https://api.imgbb.com/1/upload', {
          method: 'POST',
          body,
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json() as any;

        if (data.success) {
          return {
            success: true,
            url: data.data.url,
            filename: data.data.display_url.split('/').pop(),
            size: fileBuffer.length,
          };
        }
      } catch (error) {
        continue;
      }
    }

    return {
      success: false,
      error: 'All ImgBB API keys failed',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
};

/**
 * Upload file locally
 */
export const uploadLocally = async (filePath: string, filename: string): Promise<UploadResponse> => {
  try {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';

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
export const getFileUrl = (filename: string, useImgBB: boolean = false): string => {
  if (useImgBB) {
    return `https://imgbb.com/${filename}`;
  }
  return `/uploads/${filename}`;
};
