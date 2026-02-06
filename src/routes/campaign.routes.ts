import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  createCampaign,
  getCampaigns,
  getCampaign,
  updateCampaign,
  updateCampaignStatus,
  deleteCampaign,
  submitResponse,
  getCampaignResults,
} from '../controllers/campaign.controller.js';

const router = Router();

// Public (with optional auth for getCampaigns filtering)
router.get('/', getCampaigns);
router.get('/:id', getCampaign);

// Authenticated - submit response
router.post('/:id/respond', authenticate, submitResponse);

// Manager routes
router.post('/', authenticate, requireRole('CONTENT_MANAGER'), createCampaign);
router.put('/:id', authenticate, requireRole('CONTENT_MANAGER'), updateCampaign);
router.put('/:id/status', authenticate, requireRole('CONTENT_MANAGER'), updateCampaignStatus);
router.delete('/:id', authenticate, requireRole('CONTENT_MANAGER'), deleteCampaign);
router.get('/:id/results', authenticate, requireRole('CONTENT_MANAGER'), getCampaignResults);

export default router;
