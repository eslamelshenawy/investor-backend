import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
} from '../controllers/auth.controller.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.post('/change-password', authenticate, changePassword);

export default router;
