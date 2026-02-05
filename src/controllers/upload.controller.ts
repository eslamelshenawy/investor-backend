import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

const UPLOAD_DIR = path.resolve('uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml',
];

const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = crypto.randomBytes(16).toString('hex');
    cb(null, `${name}${ext}`);
  },
});

export const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. الأنواع المسموحة: JPG, PNG, WebP, GIF, SVG'));
    }
  },
});

export async function uploadFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      sendError(res, 'No file uploaded', 'لم يتم رفع أي ملف', 400);
      return;
    }

    const fileUrl = `/api/uploads/${req.file.filename}`;

    logger.info(`File uploaded: ${req.file.filename} by user ${req.user!.userId}`);

    sendSuccess(res, {
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
      url: fileUrl,
    }, 201);
  } catch (error) {
    next(error);
  }
}

export async function uploadMultiple(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      sendError(res, 'No files uploaded', 'لم يتم رفع أي ملفات', 400);
      return;
    }

    const results = files.map((file) => ({
      filename: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      url: `/api/uploads/${file.filename}`,
    }));

    logger.info(`${files.length} files uploaded by user ${req.user!.userId}`);

    sendSuccess(res, results, 201);
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { filename } = req.params;

    // Prevent directory traversal
    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

    if (!fs.existsSync(filePath)) {
      sendError(res, 'File not found', 'الملف غير موجود', 404);
      return;
    }

    fs.unlinkSync(filePath);
    logger.info(`File deleted: ${safeName} by user ${req.user!.userId}`);

    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
}

export default { upload, uploadFile, uploadMultiple, deleteFile };
