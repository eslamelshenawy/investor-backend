import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  getDatasets,
  getDataset,
  getDatasetData,
  getDatasetPreviewData,
  refreshDatasetCache,
  getCategories,
  getSyncStatus,
  getSaudiDatasets,
  getAllSaudiDatasets,
  getUnverifiedDatasets,
  getVerificationStats,
  verifyDataset,
} from '../controllers/dataset.controller.js';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// Public routes - لا تحتاج تسجيل دخول
// ═══════════════════════════════════════════════════════════════════

/**
 * @route   GET /api/datasets
 * @desc    قائمة كل الـ Datasets (metadata فقط)
 * @access  Public
 */
router.get('/', getDatasets);

/**
 * @route   GET /api/datasets/saudi
 * @desc    جلب قائمة الـ Datasets مباشرة من Saudi API (مع Redis cache)
 * @query   page, limit, search, category, refresh
 * @access  Public
 * @note    هذا الـ endpoint يجلب مباشرة من البوابة الوطنية بدون DB
 */
router.get('/saudi', getSaudiDatasets);

/**
 * @route   GET /api/datasets/saudi/all
 * @desc    جلب كل الـ Datasets من Saudi API (pagination تلقائي)
 * @access  Public
 * @note    قد يستغرق وقت لجلب كل الـ Datasets
 */
router.get('/saudi/all', getAllSaudiDatasets);

/**
 * @route   GET /api/datasets/categories
 * @desc    قائمة الأقسام مع عدد الـ Datasets
 * @access  Public
 */
router.get('/categories', getCategories);

/**
 * @route   GET /api/datasets/sync/status
 * @desc    حالة المزامنة
 * @access  Public
 */
router.get('/sync/status', getSyncStatus);

/**
 * @route   GET /api/datasets/unverified
 * @desc    قائمة مجموعات البيانات غير المحققة
 * @access  Expert+
 */
router.get('/unverified', authenticate, requireRole('EXPERT', 'ADMIN', 'SUPER_ADMIN'), getUnverifiedDatasets);

/**
 * @route   GET /api/datasets/verification-stats
 * @desc    إحصائيات التحقق
 * @access  Expert+
 */
router.get('/verification-stats', authenticate, requireRole('EXPERT', 'ADMIN', 'SUPER_ADMIN'), getVerificationStats);

/**
 * @route   GET /api/datasets/:id
 * @desc    تفاصيل Dataset (metadata فقط)
 * @access  Public
 */
router.get('/:id', getDataset);

/**
 * @route   GET /api/datasets/:id/data
 * @desc    جلب البيانات الفعلية ON-DEMAND من Saudi Open Data API
 * @query   page, limit, refresh
 * @access  Public
 * @note    البيانات تُجلب مباشرة من API ولا تُخزن في DB
 */
router.get('/:id/data', getDatasetData);

/**
 * @route   GET /api/datasets/:id/preview
 * @desc    معاينة سريعة (أول N سجل) - ON-DEMAND
 * @query   count (default: 10, max: 50)
 * @access  Public
 */
router.get('/:id/preview', getDatasetPreviewData);

// ═══════════════════════════════════════════════════════════════════
// Protected routes - تحتاج تسجيل دخول
// ═══════════════════════════════════════════════════════════════════

/**
 * @route   POST /api/datasets/:id/refresh
 * @desc    تحديث الـ Cache وإعادة جلب البيانات
 * @access  Admin
 */
router.post('/:id/refresh', authenticate, requireRole('ADMIN'), refreshDatasetCache);

/**
 * @route   PATCH /api/datasets/:id/verify
 * @desc    تحديث حالة التحقق لمجموعة بيانات
 * @access  Expert+
 */
router.patch('/:id/verify', authenticate, requireRole('EXPERT', 'ADMIN', 'SUPER_ADMIN'), verifyDataset);

export default router;
