import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import {
  createConversation,
  getConversations,
  getMessages,
  deleteConversation,
  sendMessage,
  quickChat,
} from '../controllers/chat.controller.js';

const router = Router();

// All chat routes require authentication
router.post('/quick', authenticate, quickChat);
router.post('/conversations', authenticate, createConversation);
router.get('/conversations', authenticate, getConversations);
router.get('/conversations/:id/messages', authenticate, getMessages);
router.post('/conversations/:id/messages', authenticate, sendMessage);
router.delete('/conversations/:id', authenticate, deleteConversation);

export default router;
