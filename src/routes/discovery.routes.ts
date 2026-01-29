import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  discover,
  addDatasets,
  stats,
  discoverAndSync,
  syncAll,
  syncOne,
} from '../controllers/discovery.controller.js';

const router = Router();

// كل الـ routes تحتاج تسجيل دخول + صلاحية Admin
router.use(authenticate);
router.use(requireRole('ADMIN'));

/**
 * @route   GET /api/discovery/stats
 * @desc    الحصول على إحصائيات الاكتشاف والمزامنة
 * @access  Admin
 */
router.get('/stats', stats);

/**
 * @route   GET /api/discovery/discover
 * @desc    اكتشاف Datasets جديدة من الموقع (Browserless.io)
 * @access  Admin
 */
router.get('/discover', discover);

/**
 * @route   POST /api/discovery/add
 * @desc    إضافة Datasets جديدة يدوياً
 * @body    { datasetIds: string[] }
 * @access  Admin
 */
router.post('/add', addDatasets);

/**
 * @route   POST /api/discovery/discover-and-sync
 * @desc    اكتشاف ومزامنة - العملية الكاملة
 * @access  Admin
 */
router.post('/discover-and-sync', discoverAndSync);

/**
 * @route   POST /api/discovery/sync-all
 * @desc    مزامنة كل الـ Datasets
 * @access  Admin
 */
router.post('/sync-all', syncAll);

/**
 * @route   POST /api/discovery/sync/:datasetId
 * @desc    مزامنة dataset واحد
 * @access  Admin
 */
router.post('/sync/:datasetId', syncOne);

export default router;
