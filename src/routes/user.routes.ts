import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  getDashboards,
  getDashboardsStream,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/user.controller.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Favorites
router.get('/favorites', getFavorites);
router.post('/favorites', addFavorite);
router.delete('/favorites/:itemType/:itemId', removeFavorite);
router.get('/favorites/check/:itemType/:itemId', checkFavorite);

// Dashboards
router.get('/dashboards', getDashboards);
router.get('/dashboards/stream', getDashboardsStream);
router.get('/dashboards/:id', getDashboard);
router.post('/dashboards', createDashboard);
router.put('/dashboards/:id', updateDashboard);
router.delete('/dashboards/:id', deleteDashboard);

// Notifications
router.get('/notifications', getNotifications);
router.put('/notifications/:id/read', markNotificationRead);
router.put('/notifications/read-all', markAllNotificationsRead);

export default router;
