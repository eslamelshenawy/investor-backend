/**
 * Chat Controller - المستشار الذكي
 * AI Chatbot with conversation history
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

const SYSTEM_PROMPT = `أنت "رادار" - المستشار الذكي لمنصة رادار المستثمر السعودي.

دورك:
- مساعدة المستثمرين في فهم البيانات الاقتصادية السعودية
- تقديم تحليلات استثمارية مبنية على بيانات حكومية رسمية
- شرح المؤشرات الاقتصادية والتوجهات في السوق السعودي
- الإجابة على أسئلة حول القطاعات الاقتصادية المختلفة
- تقديم نصائح عامة حول الاستثمار في المملكة

قواعد:
- أجب دائماً بالعربية إلا إذا طلب المستخدم غير ذلك
- كن موجزاً ومفيداً
- لا تقدم نصائح مالية مباشرة - وضّح أن هذه معلومات عامة
- استخدم بيانات وإحصائيات من مصادر سعودية رسمية عندما تكون متاحة
- كن ودوداً ومحترفاً`;

/**
 * POST /chat/conversations
 * Create a new conversation
 */
export async function createConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;

    const conversation = await prisma.conversation.create({
      data: {
        userId,
        title: 'محادثة جديدة',
      },
    });

    sendSuccess(res, conversation, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /chat/conversations
 * List user's conversations
 */
export async function getConversations(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;

    const conversations = await prisma.conversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      include: {
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          select: { content: true, role: true, createdAt: true },
        },
        _count: { select: { messages: true } },
      },
    });

    sendSuccess(res, conversations);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /chat/conversations/:id/messages
 * Get messages for a conversation
 */
export async function getMessages(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
    });

    if (!conversation) {
      sendError(res, 'Conversation not found', 'المحادثة غير موجودة', 404);
      return;
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
    });

    sendSuccess(res, { conversation, messages });
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /chat/conversations/:id
 * Delete a conversation
 */
export async function deleteConversation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
    });

    if (!conversation) {
      sendError(res, 'Conversation not found', 'المحادثة غير موجودة', 404);
      return;
    }

    await prisma.conversation.delete({ where: { id } });

    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
}

const sendMessageSchema = z.object({
  message: z.string().min(1).max(4000),
});

/**
 * POST /chat/conversations/:id/messages
 * Send a message and get AI response
 */
export async function sendMessage(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { id } = req.params;
    const { message } = sendMessageSchema.parse(req.body);

    // Verify conversation belongs to user
    const conversation = await prisma.conversation.findFirst({
      where: { id, userId },
    });

    if (!conversation) {
      sendError(res, 'Conversation not found', 'المحادثة غير موجودة', 404);
      return;
    }

    // Save user message
    await prisma.chatMessage.create({
      data: { conversationId: id, role: 'user', content: message },
    });

    // Get conversation history (last 20 messages for context)
    const history = await prisma.chatMessage.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    // Build messages for OpenAI
    const openaiMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...history.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    // Call OpenAI
    let aiResponse = '';

    if (!config.openaiApiKey) {
      aiResponse = 'عذراً، خدمة المستشار الذكي غير متوفرة حالياً. يرجى المحاولة لاحقاً.';
    } else {
      try {
        const openaiRes = await fetch(OPENAI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${config.openaiApiKey.replace(/\s+/g, '')}`,
          },
          body: JSON.stringify({
            model: config.openaiModel,
            messages: openaiMessages,
            temperature: 0.7,
            max_tokens: 2000,
          }),
        });

        const data = await openaiRes.json() as any;

        if (data.choices?.[0]?.message?.content) {
          aiResponse = data.choices[0].message.content;
        } else if (data.error) {
          logger.error('OpenAI error:', data.error.message);
          aiResponse = 'عذراً، حدث خطأ في معالجة طلبك. يرجى المحاولة مرة أخرى.';
        } else {
          aiResponse = 'عذراً، لم أتمكن من معالجة طلبك. يرجى المحاولة مرة أخرى.';
        }
      } catch (err) {
        logger.error('OpenAI request failed:', err);
        aiResponse = 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة لاحقاً.';
      }
    }

    // Save AI response
    const aiMessage = await prisma.chatMessage.create({
      data: { conversationId: id, role: 'assistant', content: aiResponse },
    });

    // Update conversation title from first user message
    if (conversation.title === 'محادثة جديدة') {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      await prisma.conversation.update({
        where: { id },
        data: { title },
      });
    }

    // Update conversation updatedAt
    await prisma.conversation.update({
      where: { id },
      data: { updatedAt: new Date() },
    });

    sendSuccess(res, {
      message: aiMessage,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /chat/quick
 * Quick chat without conversation (single question)
 */
export async function quickChat(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { message } = sendMessageSchema.parse(req.body);

    if (!config.openaiApiKey) {
      sendSuccess(res, { response: 'عذراً، خدمة المستشار الذكي غير متوفرة حالياً.' });
      return;
    }

    try {
      const openaiRes = await fetch(OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey.replace(/\s+/g, '')}`,
        },
        body: JSON.stringify({
          model: config.openaiModel,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: message },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      const data = await openaiRes.json() as any;

      if (data.choices?.[0]?.message?.content) {
        sendSuccess(res, { response: data.choices[0].message.content });
      } else {
        sendSuccess(res, { response: 'عذراً، لم أتمكن من معالجة طلبك.' });
      }
    } catch {
      sendSuccess(res, { response: 'عذراً، حدث خطأ في الاتصال.' });
    }
  } catch (error) {
    next(error);
  }
}
