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
import discoveryRoutes from './discovery.routes.js';
import syncRoutes from './sync.routes.js';
import statsRoutes from './stats.routes.js';
import searchRoutes from './search.routes.js';
import exportRoutes from './export.routes.js';
import uploadRoutes from './upload.routes.js';
import dashboardTemplateRoutes from './dashboard-template.routes.js';
import recommendationRoutes from './recommendation.routes.js';
import { getHeatmapData } from '../controllers/heatmap.controller.js';

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
router.use('/discovery', discoveryRoutes);
router.use('/sync', syncRoutes);
router.use('/stats', statsRoutes);
router.use('/search', searchRoutes);
router.use('/export', exportRoutes);
router.use('/uploads', uploadRoutes);
router.use('/dashboard-templates', dashboardTemplateRoutes);
router.use('/recommendations', recommendationRoutes);
router.get('/heatmap', getHeatmapData);

export default router;
