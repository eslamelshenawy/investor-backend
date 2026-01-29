import { Router } from 'express';
import {
  getWidgets,
  getWidget,
  getWidgetCategories,
  getWidgetTypes
} from '../controllers/widget.controller.js';

const router = Router();

// Public routes
router.get('/', getWidgets);
router.get('/categories', getWidgetCategories);
router.get('/types', getWidgetTypes);
router.get('/:id', getWidget);

export default router;
