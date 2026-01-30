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

export default router;
