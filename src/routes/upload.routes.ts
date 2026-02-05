import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { upload, uploadFile, uploadMultiple, deleteFile } from '../controllers/upload.controller.js';

const router = Router();

// Upload single file (authenticated)
router.post('/', authenticate, upload.single('file'), uploadFile);

// Upload multiple files (authenticated, max 10)
router.post('/multiple', authenticate, upload.array('files', 10), uploadMultiple);

// Delete file (authenticated)
router.delete('/:filename', authenticate, deleteFile);

export default router;
