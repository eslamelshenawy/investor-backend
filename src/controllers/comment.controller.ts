import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

// Get comments for a content item
export async function getComments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    // Get top-level comments (no parentId) with their replies
    const [comments, total] = await Promise.all([
      prisma.comment.findMany({
        where: { contentId, parentId: null },
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, nameAr: true, avatar: true, role: true },
          },
          replies: {
            orderBy: { createdAt: 'asc' },
            include: {
              user: {
                select: { id: true, name: true, nameAr: true, avatar: true, role: true },
              },
            },
          },
        },
      }),
      prisma.comment.count({ where: { contentId, parentId: null } }),
    ]);

    sendPaginated(res, comments, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Create a comment
export async function createComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user!.userId;
    const { body, bodyAr, parentId } = req.body;

    if (!body || body.trim().length === 0) {
      sendError(res, 'Comment body is required', 'نص التعليق مطلوب', 400);
      return;
    }

    // Verify content exists
    const content = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, status: true },
    });

    if (!content || content.status !== 'PUBLISHED') {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    // If replying, verify parent comment exists
    if (parentId) {
      const parent = await prisma.comment.findUnique({
        where: { id: parentId },
        select: { id: true, contentId: true },
      });

      if (!parent || parent.contentId !== contentId) {
        sendError(res, 'Parent comment not found', 'التعليق الأصلي غير موجود', 404);
        return;
      }
    }

    // Create comment and increment counter atomically
    const [comment] = await prisma.$transaction([
      prisma.comment.create({
        data: {
          contentId,
          userId,
          parentId: parentId || null,
          body: body.trim(),
          bodyAr: bodyAr?.trim() || null,
        },
        include: {
          user: {
            select: { id: true, name: true, nameAr: true, avatar: true, role: true },
          },
        },
      }),
      prisma.content.update({
        where: { id: contentId },
        data: { commentCount: { increment: 1 } },
      }),
    ]);

    sendSuccess(res, comment, 'Comment created', 'تم إضافة التعليق');
  } catch (error) {
    next(error);
  }
}

// Update own comment
export async function updateComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const commentId = String(req.params.cid);
    const userId = req.user!.userId;
    const { body, bodyAr } = req.body;

    if (!body || body.trim().length === 0) {
      sendError(res, 'Comment body is required', 'نص التعليق مطلوب', 400);
      return;
    }

    // Find comment and verify ownership
    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true },
    });

    if (!existing) {
      sendError(res, 'Comment not found', 'التعليق غير موجود', 404);
      return;
    }

    if (existing.userId !== userId) {
      sendError(res, 'You can only edit your own comments', 'يمكنك تعديل تعليقاتك فقط', 403);
      return;
    }

    const comment = await prisma.comment.update({
      where: { id: commentId },
      data: {
        body: body.trim(),
        bodyAr: bodyAr?.trim() || undefined,
        isEdited: true,
      },
      include: {
        user: {
          select: { id: true, name: true, nameAr: true, avatar: true, role: true },
        },
      },
    });

    sendSuccess(res, comment, 'Comment updated', 'تم تعديل التعليق');
  } catch (error) {
    next(error);
  }
}

// Delete comment (own or admin)
export async function deleteComment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const commentId = String(req.params.cid);
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const adminRoles = ['ADMIN', 'SUPER_ADMIN', 'CONTENT_MANAGER'];

    const existing = await prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true, userId: true, contentId: true },
    });

    if (!existing) {
      sendError(res, 'Comment not found', 'التعليق غير موجود', 404);
      return;
    }

    if (existing.userId !== userId && !adminRoles.includes(userRole)) {
      sendError(res, 'You can only delete your own comments', 'يمكنك حذف تعليقاتك فقط', 403);
      return;
    }

    // Count replies that will also be deleted
    const replyCount = await prisma.comment.count({
      where: { parentId: commentId },
    });

    // Delete comment (cascades to replies) and decrement counter
    await prisma.$transaction([
      prisma.comment.delete({ where: { id: commentId } }),
      prisma.content.update({
        where: { id: existing.contentId },
        data: { commentCount: { decrement: 1 + replyCount } },
      }),
    ]);

    sendSuccess(res, { deleted: true }, 'Comment deleted', 'تم حذف التعليق');
  } catch (error) {
    next(error);
  }
}

// SSE Stream: Get comments for a content item as a stream
export async function getCommentsStream(req: Request, res: Response, _next: NextFunction): Promise<void> {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendEvent = (eventName: string, data: unknown) => {
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const contentId = String(req.params.id);
    const total = await prisma.comment.count({ where: { contentId, parentId: null } });
    sendEvent('start', { message: 'جاري تحميل التعليقات...', total, timestamp: new Date() });

    const comments = await prisma.comment.findMany({
      where: { contentId, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, nameAr: true, avatar: true, role: true } },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: {
            user: { select: { id: true, name: true, nameAr: true, avatar: true, role: true } },
          },
        },
      },
    });

    for (const comment of comments) {
      sendEvent('comment', comment);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    sendEvent('complete', { message: 'تم تحميل جميع التعليقات', total: comments.length });
    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل التعليقات', error: String(error) });
    res.end();
  }
}

export default { getComments, getCommentsStream, createComment, updateComment, deleteComment };
