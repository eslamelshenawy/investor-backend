import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  exportDatasets,
  exportSignals,
  exportContent,
  exportEntities,
  exportDatasetData,
} from '../controllers/export.controller.js';

const router = Router();

// All export routes require authentication
router.get('/datasets', authenticate, exportDatasets);
router.get('/signals', authenticate, exportSignals);
router.get('/content', authenticate, exportContent);
router.get('/entities', authenticate, exportEntities);
router.get('/dataset/:id', authenticate, exportDatasetData);

export default router;
