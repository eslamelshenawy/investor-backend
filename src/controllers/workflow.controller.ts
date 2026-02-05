import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

// Valid roles that can create content
const CREATOR_ROLES = ['WRITER', 'EXPERT', 'ANALYST', 'DESIGNER', 'ADMIN', 'SUPER_ADMIN'];

// All 12 post types
export const POST_TYPES = {
  INTRO_INSIGHT:       { id: 'INTRO_INSIGHT',       label: 'رؤية تمهيدية',         labelEn: 'Intro Insight' },
  QUICK_METRIC:        { id: 'QUICK_METRIC',        label: 'مؤشر سريع',            labelEn: 'Quick Metric' },
  SIGNAL_POST:         { id: 'SIGNAL_POST',         label: 'إشارة ذكية',           labelEn: 'Signal Post' },
  COMPARISON:          { id: 'COMPARISON',           label: 'مقارنة رقمية',         labelEn: 'Comparison' },
  CHART_GRAPH:         { id: 'CHART_GRAPH',          label: 'تحليل بصري',           labelEn: 'Chart/Graph' },
  VISUAL_CONTEXT:      { id: 'VISUAL_CONTEXT',       label: 'صورة تحليلية',         labelEn: 'Visual Context' },
  AI_SUMMARY:          { id: 'AI_SUMMARY',           label: 'ملخص ذكاء اصطناعي',    labelEn: 'AI Summary' },
  PROGRESS_DIST:       { id: 'PROGRESS_DIST',        label: 'شريط توزيع',           labelEn: 'Progress/Distribution' },
  CONTEXT_ALERT:       { id: 'CONTEXT_ALERT',        label: 'تنبيه سياقي',          labelEn: 'Context Alert' },
  HISTORICAL_COMPARE:  { id: 'HISTORICAL_COMPARE',   label: 'مقارنة تاريخية',       labelEn: 'Historical Comparison' },
  DEEP_INSIGHT:        { id: 'DEEP_INSIGHT',         label: 'تحليل معمّق',          labelEn: 'Deep Insight' },
  DATASET_HIGHLIGHT:   { id: 'DATASET_HIGHLIGHT',    label: 'إبراز مجموعة بيانات',  labelEn: 'Dataset Highlight' },
  // Legacy types (backward compatibility)
  ARTICLE:             { id: 'ARTICLE',              label: 'مقال',                 labelEn: 'Article' },
  REPORT:              { id: 'REPORT',               label: 'تقرير',                labelEn: 'Report' },
  ANALYSIS:            { id: 'ANALYSIS',             label: 'تحليل',                labelEn: 'Analysis' },
  INSIGHT:             { id: 'INSIGHT',              label: 'رؤية',                 labelEn: 'Insight' },
  CHART:               { id: 'CHART',                label: 'رسم بياني',            labelEn: 'Chart' },
  VISUAL:              { id: 'VISUAL',               label: 'بصري',                 labelEn: 'Visual' },
  INFOGRAPHIC:         { id: 'INFOGRAPHIC',          label: 'إنفوجرافيك',           labelEn: 'Infographic' },
};

const ALL_TYPE_IDS = Object.keys(POST_TYPES);

// Role-to-content-type mapping
const ROLE_CONTENT_TYPES: Record<string, string[]> = {
  WRITER: ['ARTICLE', 'REPORT', 'INTRO_INSIGHT', 'QUICK_METRIC', 'AI_SUMMARY', 'CONTEXT_ALERT'],
  EXPERT: ['ARTICLE', 'REPORT', 'ANALYSIS', 'INSIGHT', 'DEEP_INSIGHT', 'INTRO_INSIGHT', 'SIGNAL_POST', 'COMPARISON', 'HISTORICAL_COMPARE', 'CONTEXT_ALERT', 'AI_SUMMARY', 'QUICK_METRIC'],
  ANALYST: ['ANALYSIS', 'CHART', 'COMPARISON', 'DATASET_HIGHLIGHT', 'CHART_GRAPH', 'QUICK_METRIC', 'PROGRESS_DIST', 'HISTORICAL_COMPARE', 'DEEP_INSIGHT'],
  DESIGNER: ['VISUAL', 'INFOGRAPHIC', 'VISUAL_CONTEXT', 'CHART_GRAPH', 'PROGRESS_DIST'],
  ADMIN: ALL_TYPE_IDS,
  SUPER_ADMIN: ALL_TYPE_IDS,
};

// Roles that can review content
const REVIEWER_ROLES = ['EDITOR', 'ADMIN', 'SUPER_ADMIN'];

// Roles that can schedule/publish content
const PUBLISHER_ROLES = ['CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

// Create content as draft
export async function createUserContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const userRole = req.user!.role;
    const { type, title, titleAr, body, bodyAr, excerpt, excerptAr, tags, datasetId, metadata } = req.body;

    if (!CREATOR_ROLES.includes(userRole)) {
      sendError(res, 'You do not have permission to create content', 'ليس لديك صلاحية لإنشاء المحتوى', 403);
      return;
    }

    if (!type || !title || !titleAr || !body || !bodyAr) {
      sendError(res, 'Missing required fields: type, title, titleAr, body, bodyAr', 'حقول مطلوبة مفقودة: النوع، العنوان، المحتوى', 400);
      return;
    }

    // Validate content type for role
    const allowedTypes = ROLE_CONTENT_TYPES[userRole] || [];
    if (!allowedTypes.includes(type)) {
      sendError(
        res,
        `Your role (${userRole}) cannot create content of type: ${type}`,
        `دورك (${userRole}) لا يسمح بإنشاء محتوى من نوع: ${type}`,
        403
      );
      return;
    }

    const content = await prisma.content.create({
      data: {
        type,
        title,
        titleAr,
        body,
        bodyAr,
        excerpt: excerpt || null,
        excerptAr: excerptAr || null,
        tags: JSON.stringify(tags || []),
        metadata: JSON.stringify(metadata || {}),
        datasetId: datasetId || null,
        authorId: userId,
        status: 'DRAFT',
      },
      include: {
        author: {
          select: { id: true, name: true, nameAr: true, avatar: true, role: true },
        },
      },
    });

    sendSuccess(res, content, 'Content created as draft', 'تم إنشاء المحتوى كمسودة');
  } catch (error) {
    next(error);
  }
}

// Update own draft content
export async function updateUserContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user!.userId;
    const { title, titleAr, body, bodyAr, excerpt, excerptAr, tags, metadata } = req.body;

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, authorId: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    if (existing.authorId !== userId) {
      sendError(res, 'You can only edit your own content', 'يمكنك تعديل محتواك فقط', 403);
      return;
    }

    if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
      sendError(res, 'Only draft or rejected content can be edited', 'يمكن تعديل المسودات أو المرفوض فقط', 400);
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (titleAr !== undefined) updateData.titleAr = titleAr;
    if (body !== undefined) updateData.body = body;
    if (bodyAr !== undefined) updateData.bodyAr = bodyAr;
    if (excerpt !== undefined) updateData.excerpt = excerpt;
    if (excerptAr !== undefined) updateData.excerptAr = excerptAr;
    if (tags !== undefined) updateData.tags = JSON.stringify(tags);
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);

    // If content was rejected and re-edited, reset to DRAFT
    if (existing.status === 'REJECTED') {
      updateData.status = 'DRAFT';
      updateData.reviewNote = null;
      updateData.reviewNoteAr = null;
      updateData.reviewerId = null;
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: updateData,
      include: {
        author: {
          select: { id: true, name: true, nameAr: true, avatar: true, role: true },
        },
      },
    });

    sendSuccess(res, content, 'Content updated', 'تم تحديث المحتوى');
  } catch (error) {
    next(error);
  }
}

// Delete own draft content
export async function deleteUserContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user!.userId;
    const userRole = req.user!.role;

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, authorId: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    const isAdmin = ['ADMIN', 'SUPER_ADMIN'].includes(userRole);
    const isOwner = existing.authorId === userId;

    if (!isOwner && !isAdmin) {
      sendError(res, 'You can only delete your own content', 'يمكنك حذف محتواك فقط', 403);
      return;
    }

    if (!isAdmin && existing.status !== 'DRAFT') {
      sendError(res, 'Only drafts can be deleted', 'يمكن حذف المسودات فقط', 400);
      return;
    }

    await prisma.content.delete({ where: { id: contentId } });

    sendSuccess(res, { deleted: true }, 'Content deleted', 'تم حذف المحتوى');
  } catch (error) {
    next(error);
  }
}

// Get current user's content (all statuses)
export async function getMyContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { status, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = { authorId: userId };
    if (status) where.status = String(status);

    const [content, total] = await Promise.all([
      prisma.content.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: {
            select: { id: true, name: true, nameAr: true, avatar: true, role: true },
          },
        },
      }),
      prisma.content.count({ where }),
    ]);

    sendPaginated(res, content, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Submit content for review (DRAFT -> PENDING_REVIEW)
export async function submitForReview(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userId = req.user!.userId;

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, authorId: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    if (existing.authorId !== userId) {
      sendError(res, 'You can only submit your own content', 'يمكنك إرسال محتواك فقط', 403);
      return;
    }

    if (existing.status !== 'DRAFT') {
      sendError(res, 'Only drafts can be submitted for review', 'يمكن إرسال المسودات فقط للمراجعة', 400);
      return;
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: { status: 'PENDING_REVIEW' },
    });

    sendSuccess(res, content, 'Content submitted for review', 'تم إرسال المحتوى للمراجعة');
  } catch (error) {
    next(error);
  }
}

// Review content - approve or reject (EDITOR)
export async function reviewContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const reviewerId = req.user!.userId;
    const userRole = req.user!.role;
    const { action, note, noteAr } = req.body;

    if (!REVIEWER_ROLES.includes(userRole)) {
      sendError(res, 'You do not have permission to review content', 'ليس لديك صلاحية مراجعة المحتوى', 403);
      return;
    }

    if (!action || !['approve', 'reject'].includes(action)) {
      sendError(res, 'Action must be "approve" or "reject"', 'الإجراء يجب أن يكون "approve" أو "reject"', 400);
      return;
    }

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    if (existing.status !== 'PENDING_REVIEW') {
      sendError(res, 'Only pending content can be reviewed', 'يمكن مراجعة المحتوى المعلق فقط', 400);
      return;
    }

    const newStatus = action === 'approve' ? 'APPROVED' : 'REJECTED';

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        status: newStatus,
        reviewerId,
        reviewNote: note || null,
        reviewNoteAr: noteAr || null,
      },
      include: {
        author: {
          select: { id: true, name: true, nameAr: true },
        },
      },
    });

    const msg = action === 'approve' ? 'Content approved' : 'Content rejected';
    const msgAr = action === 'approve' ? 'تمت الموافقة على المحتوى' : 'تم رفض المحتوى';

    sendSuccess(res, content, msg, msgAr);
  } catch (error) {
    next(error);
  }
}

// Schedule content for publication (CONTENT_MANAGER)
export async function scheduleContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userRole = req.user!.role;
    const { scheduledAt } = req.body;

    if (!PUBLISHER_ROLES.includes(userRole)) {
      sendError(res, 'You do not have permission to schedule content', 'ليس لديك صلاحية جدولة المحتوى', 403);
      return;
    }

    if (!scheduledAt) {
      sendError(res, 'scheduledAt is required', 'تاريخ الجدولة مطلوب', 400);
      return;
    }

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    if (existing.status !== 'APPROVED') {
      sendError(res, 'Only approved content can be scheduled', 'يمكن جدولة المحتوى المعتمد فقط', 400);
      return;
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'SCHEDULED',
        scheduledAt: new Date(scheduledAt),
      },
    });

    sendSuccess(res, content, 'Content scheduled', 'تمت جدولة المحتوى');
  } catch (error) {
    next(error);
  }
}

// Publish content immediately (CONTENT_MANAGER / ADMIN)
export async function publishContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userRole = req.user!.role;

    if (!PUBLISHER_ROLES.includes(userRole)) {
      sendError(res, 'You do not have permission to publish content', 'ليس لديك صلاحية نشر المحتوى', 403);
      return;
    }

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, status: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    if (!['APPROVED', 'SCHEDULED'].includes(existing.status)) {
      sendError(res, 'Only approved or scheduled content can be published', 'يمكن نشر المحتوى المعتمد أو المجدول فقط', 400);
      return;
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: {
        status: 'PUBLISHED',
        publishedAt: new Date(),
        scheduledAt: null,
      },
    });

    sendSuccess(res, content, 'Content published', 'تم نشر المحتوى');
  } catch (error) {
    next(error);
  }
}

// Pin/Unpin content (CONTENT_MANAGER / ADMIN)
export async function pinContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const contentId = String(req.params.id);
    const userRole = req.user!.role;

    if (!PUBLISHER_ROLES.includes(userRole)) {
      sendError(res, 'You do not have permission to pin content', 'ليس لديك صلاحية تثبيت المحتوى', 403);
      return;
    }

    const existing = await prisma.content.findUnique({
      where: { id: contentId },
      select: { id: true, isPinned: true },
    });

    if (!existing) {
      sendError(res, 'Content not found', 'المحتوى غير موجود', 404);
      return;
    }

    const content = await prisma.content.update({
      where: { id: contentId },
      data: { isPinned: !existing.isPinned },
    });

    const msg = content.isPinned ? 'Content pinned' : 'Content unpinned';
    const msgAr = content.isPinned ? 'تم تثبيت المحتوى' : 'تم إلغاء تثبيت المحتوى';

    sendSuccess(res, content, msg, msgAr);
  } catch (error) {
    next(error);
  }
}

// Get pending review content (for editors)
export async function getPendingContent(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '20', status = 'PENDING_REVIEW' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const validStatuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED'];
    const queryStatus = validStatuses.includes(String(status)) ? String(status) : 'PENDING_REVIEW';

    const where = { status: queryStatus };

    const [content, total] = await Promise.all([
      prisma.content.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
        include: {
          author: {
            select: { id: true, name: true, nameAr: true, avatar: true, role: true },
          },
        },
      }),
      prisma.content.count({ where }),
    ]);

    sendPaginated(res, content, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// SSE Stream: Get current user's content as a stream
export async function getMyContentStream(req: Request, res: Response, _next: NextFunction): Promise<void> {
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
    const userId = req.user!.userId;
    const status = req.query.status ? String(req.query.status) : undefined;
    const where: Record<string, unknown> = { authorId: userId };
    if (status) where.status = status;

    const total = await prisma.content.count({ where });
    sendEvent('start', { message: 'جاري تحميل منشوراتك...', total, timestamp: new Date() });

    const content = await prisma.content.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, nameAr: true, avatar: true, role: true } },
      },
    });

    for (const item of content) {
      sendEvent('content', item);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    sendEvent('complete', { message: 'تم تحميل جميع المنشورات', total: content.length });
    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل المنشورات', error: String(error) });
    res.end();
  }
}

// SSE Stream: Get pending review content as a stream
export async function getPendingContentStream(req: Request, res: Response, _next: NextFunction): Promise<void> {
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
    const status = req.query.status ? String(req.query.status) : 'PENDING_REVIEW';
    const validStatuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SCHEDULED'];
    const queryStatus = validStatuses.includes(status) ? status : 'PENDING_REVIEW';
    const where = { status: queryStatus };

    const total = await prisma.content.count({ where });
    sendEvent('start', { message: 'جاري تحميل المحتوى للمراجعة...', total, timestamp: new Date() });

    const content = await prisma.content.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, nameAr: true, avatar: true, role: true } },
      },
    });

    for (const item of content) {
      sendEvent('content', item);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    sendEvent('complete', { message: 'تم تحميل جميع المحتوى', total: content.length });
    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل المحتوى', error: String(error) });
    res.end();
  }
}

// Get available post types for current user's role
export async function getPostTypes(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userRole = req.user?.role || 'USER';
    const allowedTypes = ROLE_CONTENT_TYPES[userRole] || [];

    const types = Object.values(POST_TYPES)
      .filter(t => allowedTypes.includes(t.id))
      .map(t => ({
        id: t.id,
        label: t.label,
        labelEn: t.labelEn,
      }));

    sendSuccess(res, types);
  } catch (error) {
    next(error);
  }
}

// Get all post types (public)
export async function getAllPostTypes(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const types = Object.values(POST_TYPES).map(t => ({
      id: t.id,
      label: t.label,
      labelEn: t.labelEn,
    }));

    sendSuccess(res, types);
  } catch (error) {
    next(error);
  }
}

export default {
  createUserContent,
  updateUserContent,
  deleteUserContent,
  getMyContent,
  getMyContentStream,
  submitForReview,
  reviewContent,
  scheduleContent,
  publishContent,
  pinContent,
  getPendingContent,
  getPendingContentStream,
  getPostTypes,
  getAllPostTypes,
};
