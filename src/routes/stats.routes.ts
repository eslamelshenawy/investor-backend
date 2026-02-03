import { Router } from 'express';
import {
  getOverviewStats,
  getTrendingTopics,
  getRecentActivity,
  getUserStats,
  getCategoryStats,
  getSourceStats
} from '../controllers/stats.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

/**
 * @route   GET /api/stats/overview
 * @desc    Get REAL overview stats from database
 * @access  Public
 */
router.get('/overview', getOverviewStats);

/**
 * @route   GET /api/stats/trending
 * @desc    Get REAL trending topics from database
 * @access  Public
 */
router.get('/trending', getTrendingTopics);

/**
 * @route   GET /api/stats/activity
 * @desc    Get REAL recent activity
 * @access  Public
 */
router.get('/activity', getRecentActivity);

/**
 * @route   GET /api/stats/categories
 * @desc    Get REAL category distribution
 * @access  Public
 */
router.get('/categories', getCategoryStats);

/**
 * @route   GET /api/stats/sources
 * @desc    Get REAL data sources stats
 * @access  Public
 */
router.get('/sources', getSourceStats);

/**
 * @route   GET /api/stats/user
 * @desc    Get user-specific stats (requires auth)
 * @access  Private
 */
router.get('/user', authenticate, getUserStats);

export default router;
