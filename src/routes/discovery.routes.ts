import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  discover,
  discoverAll,
  getCategories,
  addDatasets,
  stats,
  discoverAndSync,
  fullDiscoverAndSync,
  syncAll,
  syncOne,
} from '../controllers/discovery.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// Public Routes (بدون Auth - للتطوير والاختبار)
// ═══════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/discovery/stats
 * @desc    الحصول على إحصائيات الاكتشاف والمزامنة
 * @access  Public
 */
router.get('/stats', stats);

/**
 * @route   GET /api/discovery/categories
 * @desc    الحصول على قائمة الأقسام المتاحة (38 قسم)
 * @access  Public
 */
router.get('/categories', getCategories);

/**
 * @route   POST /api/discovery/start-full
 * @desc    بدء اكتشاف شامل (بدون Auth - للاختبار)
 * @access  Public
 */
router.post('/start-full', fullDiscoverAndSync);

/**
 * @route   POST /api/discovery/start-quick
 * @desc    بدء اكتشاف سريع (بدون Auth - للاختبار)
 * @access  Public
 */
router.post('/start-quick', discoverAndSync);

// ═══════════════════════════════════════════════════════════════════
// Protected Routes (تحتاج Auth + Admin)
// ═══════════════════════════════════════════════════════════════════
router.use(authenticate);
router.use(requireRole('ADMIN'));

/**
 * @route   GET /api/discovery/stats
 * @desc    الحصول على إحصائيات الاكتشاف والمزامنة
 * @access  Admin
 */
router.get('/stats', stats);

/**
 * @route   GET /api/discovery/categories
 * @desc    الحصول على قائمة الأقسام المتاحة (38 قسم)
 * @access  Admin
 */
router.get('/categories', getCategories);

/**
 * @route   GET /api/discovery/discover
 * @desc    اكتشاف سريع - الصفحة الرئيسية فقط (Browserless.io)
 * @access  Admin
 */
router.get('/discover', discover);

/**
 * @route   GET /api/discovery/discover-all
 * @desc    اكتشاف شامل - كل الأقسام (قد يستغرق وقت طويل!)
 * @access  Admin
 * @note    يمسح كل الـ 38 قسم للعثور على كل الـ 15,500+ dataset
 */
router.get('/discover-all', discoverAll);

/**
 * @route   POST /api/discovery/add
 * @desc    إضافة Datasets جديدة يدوياً
 * @body    { datasetIds: string[] }
 * @access  Admin
 */
router.post('/add', addDatasets);

/**
 * @route   POST /api/discovery/discover-and-sync
 * @desc    اكتشاف ومزامنة (سريع أو شامل)
 * @body    { fullDiscovery?: boolean } - اختياري، true للاكتشاف الشامل
 * @access  Admin
 */
router.post('/discover-and-sync', discoverAndSync);

/**
 * @route   POST /api/discovery/full-discover-and-sync
 * @desc    اكتشاف شامل ومزامنة - العملية الكاملة
 * @access  Admin
 * @warning قد يستغرق ساعات!
 */
router.post('/full-discover-and-sync', fullDiscoverAndSync);

/**
 * @route   POST /api/discovery/sync-all
 * @desc    مزامنة كل الـ Datasets الموجودة
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
