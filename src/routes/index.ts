import { Router } from 'express';
import authRoutes from './auth.routes.js';
import datasetRoutes from './dataset.routes.js';
import signalRoutes from './signal.routes.js';
import contentRoutes from './content.routes.js';
import userRoutes from './user.routes.js';
import adminRoutes from './admin.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import entityRoutes from './entity.routes.js';
import widgetRoutes from './widget.routes.js';

const router = Router();

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    message: 'API is running',
    timestamp: new Date().toISOString(),
  });
});

// API routes
router.use('/auth', authRoutes);
router.use('/datasets', datasetRoutes);
router.use('/signals', signalRoutes);
router.use('/content', contentRoutes);
router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboards', dashboardRoutes);
router.use('/entities', entityRoutes);
router.use('/widgets', widgetRoutes);

export default router;
