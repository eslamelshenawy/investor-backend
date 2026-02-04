import { Router } from 'express';
import {
  getFeed,
  getFeedStream,
  getContent,
  getTimeline,
  getTimelineStream,
  getContentTypes,
  getPopularTags,
  getTrending,
  generateFromSignal,
  generateReport,
  generateSectorReport,
  createContent,
  likeContent,
  saveContent,
} from '../controllers/content.controller.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/feed', getFeed);
router.get('/feed/stream', getFeedStream);
router.get('/timeline', getTimeline);
router.get('/timeline/stream', getTimelineStream);
router.get('/types', getContentTypes);
router.get('/tags', getPopularTags);
router.get('/trending', getTrending);
router.get('/:id', getContent);

// Interactive routes (work for both authenticated and anonymous users)
router.post('/:id/like', optionalAuth, likeContent);
router.post('/:id/save', optionalAuth, saveContent);

// Protected routes (Admin only)
router.post('/', authenticate, requireRole('ADMIN'), createContent);
router.post('/generate/signal/:signalId', authenticate, requireRole('ADMIN'), generateFromSignal);
router.post('/generate/report', authenticate, requireRole('ADMIN'), generateReport);
router.post('/generate/sector/:sector', authenticate, requireRole('ADMIN'), generateSectorReport);

export default router;
