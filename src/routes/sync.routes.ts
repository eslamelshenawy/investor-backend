/**
 * Sync Routes - Dataset synchronization endpoints
 *
 * These routes handle dataset syncing from Saudi Open Data Portal
 * Includes both public status check and protected trigger endpoints
 */

import { Router } from 'express';
import {
  triggerSync,
  getStatus,
  cronSync,
} from '../controllers/sync.controller.js';

const router = Router();

// Public: Check sync status
router.get('/status', getStatus);

// Protected: Manual trigger (requires admin key)
router.post('/trigger', triggerSync);

// Protected: Cron endpoint (requires cron secret)
router.post('/cron', cronSync);

export default router;
