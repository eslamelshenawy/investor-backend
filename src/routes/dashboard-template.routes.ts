import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { getTemplates, getTemplate, cloneTemplate } from '../controllers/dashboard-template.controller.js';

const router = Router();

// Public - browse templates
router.get('/', getTemplates);
router.get('/:id', getTemplate);

// Authenticated - clone template
router.post('/:id/clone', authenticate, cloneTemplate);

export default router;
