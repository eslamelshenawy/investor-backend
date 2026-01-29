import { Router } from 'express';
import {
  getSystemStats,
  getJobsStatus,
  triggerSync,
  triggerAnalysis,
  triggerContent,
  getUsers,
  updateUserRole,
  getSyncLogs,
} from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication and ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN'));

// System stats and monitoring
router.get('/stats', getSystemStats);
router.get('/jobs', getJobsStatus);
router.get('/logs', getSyncLogs);

// Manual job triggers
router.post('/trigger/sync', triggerSync);
router.post('/trigger/analysis', triggerAnalysis);
router.post('/trigger/content', triggerContent);

// User management
router.get('/users', getUsers);
router.patch('/users/:userId/role', updateUserRole);

export default router;
