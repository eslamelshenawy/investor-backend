import { Router } from 'express';
import {
  getEntities,
  getEntitiesStream,
  getEntity,
  getEntityTypes,
  toggleFollowEntity,
  getFollowedEntities
} from '../controllers/entity.controller.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public routes
router.get('/', getEntities);
router.get('/stream', getEntitiesStream);
router.get('/types', getEntityTypes);
router.get('/:id', getEntity);

// Protected routes
router.post('/:id/follow', authenticate, toggleFollowEntity);
router.get('/user/following', authenticate, getFollowedEntities);

export default router;
