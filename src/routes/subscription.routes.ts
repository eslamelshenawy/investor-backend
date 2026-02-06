import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  getPlans,
  getMySubscription,
  createPayment,
  activateSubscription,
  cancelSubscription,
  paymentWebhook,
  checkFeature,
} from '../controllers/subscription.controller.js';

const router = Router();

// Public routes
router.get('/plans', getPlans);
router.post('/webhook', paymentWebhook);

// Protected routes
router.get('/my', authenticate, getMySubscription);
router.post('/create-payment', authenticate, createPayment);
router.post('/activate', authenticate, activateSubscription);
router.post('/cancel', authenticate, cancelSubscription);
router.get('/check-feature/:feature', authenticate, checkFeature);

export default router;
