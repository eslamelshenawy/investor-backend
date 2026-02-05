import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  register,
  login,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  getPublicProfile,
  refreshToken,
  sendVerification,
  verifyEmail,
} from '../controllers/auth.controller.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);
router.get('/profile/:userId', getPublicProfile);

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.post('/change-password', authenticate, changePassword);
router.post('/refresh-token', authenticate, refreshToken);
router.post('/send-verification', authenticate, sendVerification);

export default router;
