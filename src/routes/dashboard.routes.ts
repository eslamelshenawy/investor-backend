import { Router } from 'express';
import {
  getDashboards,
  getCategories,
  getDashboard,
} from '../controllers/dashboard.controller.js';

const router = Router();

// Public routes
router.get('/', getDashboards);
router.get('/categories', getCategories);
router.get('/:id', getDashboard);

export default router;
