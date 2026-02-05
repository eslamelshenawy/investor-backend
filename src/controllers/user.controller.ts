import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError, sendPaginated } from '../utils/response.js';

// =====================
// Favorites
// =====================

const favoriteSchema = z.object({
  itemType: z.enum(['DATASET', 'SIGNAL', 'ARTICLE', 'DASHBOARD', 'EXPERT']),
  itemId: z.string().min(1),
});

export async function getFavorites(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { type, page = '1', limit = '20' } = req.query;
    const userId = req.user!.userId;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const where: { userId: string; itemType?: string } = { userId };
    if (type) where.itemType = String(type);

    const [favorites, total] = await Promise.all([
      prisma.favorite.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.favorite.count({ where }),
    ]);

    sendPaginated(res, favorites, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

export async function addFavorite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = favoriteSchema.parse(req.body);
    const userId = req.user!.userId;

    // Check if already favorited
    const existing = await prisma.favorite.findUnique({
      where: {
        userId_itemType_itemId: {
          userId,
          itemType: data.itemType,
          itemId: data.itemId,
        },
      },
    });

    if (existing) {
      sendError(res, 'Already in favorites', 'موجود بالفعل في المفضلة', 409);
      return;
    }

    const favorite = await prisma.favorite.create({
      data: {
        userId,
        itemType: data.itemType,
        itemId: data.itemId,
      },
    });

    sendSuccess(res, favorite, 201);
  } catch (error) {
    next(error);
  }
}

export async function removeFavorite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { itemType, itemId } = req.params;
    const userId = req.user!.userId;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_itemType_itemId: {
          userId,
          itemType,
          itemId,
        },
      },
    });

    if (!favorite) {
      sendError(res, 'Favorite not found', 'غير موجود في المفضلة', 404);
      return;
    }

    await prisma.favorite.delete({
      where: { id: favorite.id },
    });

    sendSuccess(res, { message: 'Removed from favorites' });
  } catch (error) {
    next(error);
  }
}

export async function checkFavorite(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { itemType, itemId } = req.params;
    const userId = req.user!.userId;

    const favorite = await prisma.favorite.findUnique({
      where: {
        userId_itemType_itemId: {
          userId,
          itemType,
          itemId,
        },
      },
    });

    sendSuccess(res, { isFavorite: !!favorite });
  } catch (error) {
    next(error);
  }
}

// =====================
// Dashboards
// =====================

const dashboardSchema = z.object({
  name: z.string().min(1).max(100),
  nameAr: z.string().optional(),
  description: z.string().optional(),
  widgets: z.string().optional(), // JSON string
  layout: z.string().optional(), // JSON string
  isPublic: z.boolean().optional(),
});

export async function getDashboards(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const [dashboards, total] = await Promise.all([
      prisma.dashboard.findMany({
        where: { userId },
        skip,
        take: limitNum,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.dashboard.count({ where: { userId } }),
    ]);

    sendPaginated(res, dashboards, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

export async function getDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const dashboard = await prisma.dashboard.findFirst({
      where: {
        id,
        OR: [
          { userId },
          { isPublic: true },
        ],
      },
    });

    if (!dashboard) {
      sendError(res, 'Dashboard not found', 'اللوحة غير موجودة', 404);
      return;
    }

    sendSuccess(res, dashboard);
  } catch (error) {
    next(error);
  }
}

export async function createDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = dashboardSchema.parse(req.body);
    const userId = req.user!.userId;

    const dashboard = await prisma.dashboard.create({
      data: {
        userId,
        name: data.name,
        nameAr: data.nameAr,
        description: data.description,
        widgets: data.widgets || '[]',
        layout: data.layout || '{}',
        isPublic: data.isPublic || false,
      },
    });

    sendSuccess(res, dashboard, 201);
  } catch (error) {
    next(error);
  }
}

export async function updateDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;
    const data = dashboardSchema.partial().parse(req.body);

    // Check ownership
    const existing = await prisma.dashboard.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      sendError(res, 'Dashboard not found', 'اللوحة غير موجودة', 404);
      return;
    }

    const dashboard = await prisma.dashboard.update({
      where: { id },
      data,
    });

    sendSuccess(res, dashboard);
  } catch (error) {
    next(error);
  }
}

export async function deleteDashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    // Check ownership
    const existing = await prisma.dashboard.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      sendError(res, 'Dashboard not found', 'اللوحة غير موجودة', 404);
      return;
    }

    await prisma.dashboard.delete({ where: { id } });

    sendSuccess(res, { message: 'Dashboard deleted' });
  } catch (error) {
    next(error);
  }
}

// SSE Stream: Get user dashboards as a stream (WebFlux-style)
export async function getDashboardsStream(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
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

    const total = await prisma.dashboard.count({ where: { userId } });
    sendEvent('start', { message: 'جاري تحميل لوحاتك...', total, timestamp: new Date() });

    const dashboards = await prisma.dashboard.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
    });

    for (const dashboard of dashboards) {
      sendEvent('dashboard', dashboard);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    sendEvent('complete', { message: 'تم تحميل جميع اللوحات', total: dashboards.length });
    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل اللوحات', error: String(error) });
    res.end();
  }
}

// =====================
// Notifications
// =====================

export async function getNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { unreadOnly, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(String(page), 10);
    const limitNum = parseInt(String(limit), 10);
    const skip = (pageNum - 1) * limitNum;

    const where: { userId: string; isRead?: boolean } = { userId };
    if (unreadOnly === 'true') where.isRead = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.notification.count({ where }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    sendSuccess(res, {
      notifications,
      unreadCount,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function markNotificationRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const notification = await prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      sendError(res, 'Notification not found', 'الإشعار غير موجود', 404);
      return;
    }

    await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    sendSuccess(res, { message: 'Marked as read' });
  } catch (error) {
    next(error);
  }
}

export async function markAllNotificationsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;

    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    sendSuccess(res, { message: 'All notifications marked as read' });
  } catch (error) {
    next(error);
  }
}

export default {
  getFavorites,
  addFavorite,
  removeFavorite,
  checkFavorite,
  getDashboards,
  getDashboard,
  createDashboard,
  updateDashboard,
  deleteDashboard,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
};
