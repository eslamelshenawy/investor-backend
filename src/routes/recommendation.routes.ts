import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getRecommendations } from '../controllers/recommendation.controller.js';

const router = Router();

router.get('/', authenticate, getRecommendations);

export default router;
