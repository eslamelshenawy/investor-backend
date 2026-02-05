import { Router } from 'express';
import {
  getSystemStats,
  getJobsStatus,
  triggerSync,
  triggerPortal,
  triggerAnalysis,
  triggerContent,
  getUsers,
  getUsersStream,
  getUserDetails,
  createUser,
  updateUser,
  updateUserRole,
  toggleUserStatus,
  bulkUserAction,
  getAuditLogs,
  getSyncLogs,
} from '../controllers/admin.controller.js';
import { authenticate, requireRole } from '../middleware/auth.js';

const router = Router();

// All admin routes require authentication and ADMIN/SUPER_ADMIN role
router.use(authenticate);
router.use(requireRole('ADMIN', 'SUPER_ADMIN'));

// System stats and monitoring
router.get('/stats', getSystemStats);
router.get('/jobs', getJobsStatus);
router.get('/logs', getSyncLogs);
router.get('/audit-logs', getAuditLogs);

// Manual job triggers
router.post('/trigger/sync', triggerSync);
router.post('/trigger/portal', triggerPortal);
router.post('/trigger/analysis', triggerAnalysis);
router.post('/trigger/content', triggerContent);

// User management
router.get('/users', getUsers);
router.get('/users/stream', getUsersStream);
router.get('/users/:userId', getUserDetails);
router.post('/users', createUser);
router.put('/users/:userId', updateUser);
router.patch('/users/:userId/role', updateUserRole);
router.patch('/users/:userId/status', toggleUserStatus);
router.post('/users/bulk-action', bulkUserAction);

export default router;
