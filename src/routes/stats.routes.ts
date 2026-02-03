import { Router } from 'express';
import {
  getOverviewStats,
  getTrendingTopics,
  getMarketPulse,
  getCategoryStats
} from '../controllers/stats.controller.js';

const router = Router();

/**
 * @route   GET /api/stats/overview
 * @desc    Get overview stats (total datasets, users, signals, etc.)
 * @access  Public
 */
router.get('/overview', getOverviewStats);

/**
 * @route   GET /api/stats/trending
 * @desc    Get trending topics based on content tags
 * @access  Public
 */
router.get('/trending', getTrendingTopics);

/**
 * @route   GET /api/stats/market-pulse
 * @desc    Get live market indicators
 * @access  Public
 */
router.get('/market-pulse', getMarketPulse);

/**
 * @route   GET /api/stats/categories
 * @desc    Get detailed category statistics
 * @access  Public
 */
router.get('/categories', getCategoryStats);

export default router;
