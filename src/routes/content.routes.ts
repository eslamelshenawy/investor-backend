import { Router } from 'express';
import {
  getFeed,
  getContent,
  getTimeline,
  getContentTypes,
  getPopularTags,
  getTrending,
  generateFromSignal,
  generateReport,
  generateSectorReport,
  createContent,
} from '../controllers/content.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/feed', getFeed);
router.get('/timeline', getTimeline);
router.get('/types', getContentTypes);
router.get('/tags', getPopularTags);
router.get('/trending', getTrending);
router.get('/:id', getContent);

// Protected routes (Admin only)
router.post('/', authenticate, requireRole('ADMIN'), createContent);
router.post('/generate/signal/:signalId', authenticate, requireRole('ADMIN'), generateFromSignal);
router.post('/generate/report', authenticate, requireRole('ADMIN'), generateReport);
router.post('/generate/sector/:sector', authenticate, requireRole('ADMIN'), generateSectorReport);

export default router;
