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
  getMyNetwork,
} from '../controllers/auth.controller.js';
import {
  setup2FA,
  verify2FA,
  disable2FA,
  validate2FA,
  get2FAStatus,
} from '../controllers/twoFactor.controller.js';
import { googleAuth } from '../controllers/google.controller.js';

const router = Router();

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmail);
router.get('/profile/:userId', getPublicProfile);
router.post('/2fa/validate', validate2FA); // Public - used during login
router.post('/google', googleAuth); // Public - Google OAuth

// Protected routes
router.get('/me', authenticate, getMe);
router.put('/me', authenticate, updateMe);
router.post('/change-password', authenticate, changePassword);
router.post('/refresh-token', authenticate, refreshToken);
router.post('/send-verification', authenticate, sendVerification);
router.get('/me/network', authenticate, getMyNetwork);

// 2FA routes (protected)
router.get('/2fa/status', authenticate, get2FAStatus);
router.post('/2fa/setup', authenticate, setup2FA);
router.post('/2fa/verify', authenticate, verify2FA);
router.post('/2fa/disable', authenticate, disable2FA);

export default router;
