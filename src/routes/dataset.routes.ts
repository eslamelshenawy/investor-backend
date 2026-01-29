import { Router } from 'express';
import {
  getDatasets,
  getDataset,
  getDatasetData,
  getCategories,
  getSyncStatus,
} from '../controllers/dataset.controller.js';

const router = Router();

// Public routes
router.get('/', getDatasets);
router.get('/categories', getCategories);
router.get('/sync/status', getSyncStatus);
router.get('/:id', getDataset);
router.get('/:id/data', getDatasetData);

export default router;
