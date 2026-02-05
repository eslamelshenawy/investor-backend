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
  shareContent,
  getEngagement,
} from '../controllers/content.controller.js';
import {
  createUserContent,
  updateUserContent,
  deleteUserContent,
  getMyContent,
  getMyContentStream,
  getPostTypes,
  getAllPostTypes,
  submitForReview,
  reviewContent,
  scheduleContent,
  publishContent,
  pinContent,
  getPendingContent,
  getPendingContentStream,
} from '../controllers/workflow.controller.js';
import {
  getComments,
  getCommentsStream,
  createComment,
  updateComment,
  deleteComment,
} from '../controllers/comment.controller.js';
import { authenticate, requireRole, optionalAuth } from '../middleware/auth.js';

const router = Router();

// ═══════════════════════════════════════════════════════════
// Public routes
// ═══════════════════════════════════════════════════════════
router.get('/feed', getFeed);
router.get('/feed/stream', getFeedStream);
router.get('/timeline', getTimeline);
router.get('/timeline/stream', getTimelineStream);
router.get('/types', getContentTypes);
router.get('/post-types', getAllPostTypes);
router.get('/tags', getPopularTags);
router.get('/trending', getTrending);

// ═══════════════════════════════════════════════════════════
// Content workflow routes (authenticated)
// ═══════════════════════════════════════════════════════════
router.get('/my', authenticate, getMyContent);
router.get('/my/stream', authenticate, getMyContentStream);
router.get('/pending', authenticate, requireRole('EDITOR', 'CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'), getPendingContent);
router.get('/pending/stream', authenticate, requireRole('EDITOR', 'CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'), getPendingContentStream);

// Get available post types for user's role
router.get('/my/post-types', authenticate, getPostTypes);

// Create content (role-gated in controller)
router.post('/create', authenticate, createUserContent);
router.put('/edit/:id', authenticate, updateUserContent);
router.delete('/remove/:id', authenticate, deleteUserContent);

// Workflow actions
router.patch('/:id/submit', authenticate, submitForReview);
router.patch('/:id/review', authenticate, requireRole('EDITOR', 'ADMIN', 'SUPER_ADMIN'), reviewContent);
router.patch('/:id/schedule', authenticate, requireRole('CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'), scheduleContent);
router.patch('/:id/publish', authenticate, requireRole('CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'), publishContent);
router.patch('/:id/pin', authenticate, requireRole('CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'), pinContent);

// ═══════════════════════════════════════════════════════════
// Interaction routes
// ═══════════════════════════════════════════════════════════
router.post('/:id/like', optionalAuth, likeContent);
router.post('/:id/save', authenticate, saveContent);
router.post('/:id/share', optionalAuth, shareContent);
router.get('/:id/engagement', optionalAuth, getEngagement);

// ═══════════════════════════════════════════════════════════
// Comment routes
// ═══════════════════════════════════════════════════════════
router.get('/:id/comments', getComments);
router.get('/:id/comments/stream', getCommentsStream);
router.post('/:id/comments', authenticate, createComment);
router.put('/:id/comments/:cid', authenticate, updateComment);
router.delete('/:id/comments/:cid', authenticate, deleteComment);

// ═══════════════════════════════════════════════════════════
// Single content (must be after specific routes)
// ═══════════════════════════════════════════════════════════
router.get('/:id', optionalAuth, getContent);

// ═══════════════════════════════════════════════════════════
// Admin AI generation routes
// ═══════════════════════════════════════════════════════════
router.post('/', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), createContent);
router.post('/generate/signal/:signalId', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), generateFromSignal);
router.post('/generate/report', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), generateReport);
router.post('/generate/sector/:sector', authenticate, requireRole('ADMIN', 'SUPER_ADMIN'), generateSectorReport);

export default router;
