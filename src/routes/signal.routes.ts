import { Router } from 'express';
import {
  getSignals,
  getSignal,
  getLatestSignals,
  getSignalStats,
  triggerAnalysis,
  getDailySummary,
  analyzeDatasetSignals,
  getSignalsDashboard,
  streamSignals,
} from '../controllers/signal.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/stream', streamSignals);
router.get('/', getSignals);
router.get('/latest', getLatestSignals);
router.get('/stats', getSignalStats);
router.get('/dashboard', getSignalsDashboard);
router.get('/summary', getDailySummary);
router.get('/:id', getSignal);

// Protected routes (requires authentication)
router.post('/analyze', authenticate, requireRole('ADMIN'), triggerAnalysis);
router.post('/analyze/:datasetId', authenticate, requireRole('ADMIN'), analyzeDatasetSignals);

export default router;
