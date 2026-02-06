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

    // Enrich favorites with actual item data
    const enriched = await Promise.all(
      favorites.map(async (fav) => {
        let itemTitle = '';
        let itemTitleAr = '';
        let itemDescription = '';
        let itemImage = '';
        let category = '';
        let source = '';
        let trend = '';
        let impactScore = 0;
        let viewCount = 0;
        let recordCount = 0;

        try {
          switch (fav.itemType.toUpperCase()) {
            case 'DATASET': {
              const dataset = await prisma.dataset.findUnique({
                where: { id: fav.itemId },
                select: { name: true, nameAr: true, description: true, descriptionAr: true, category: true, source: true, recordCount: true },
              });
              if (dataset) {
                itemTitle = dataset.name || '';
                itemTitleAr = dataset.nameAr || '';
                itemDescription = dataset.descriptionAr || dataset.description || '';
                category = dataset.category || '';
                source = dataset.source || '';
                recordCount = dataset.recordCount || 0;
              }
              break;
            }
            case 'SIGNAL': {
              const signal = await prisma.signal.findUnique({
                where: { id: fav.itemId },
                select: { title: true, titleAr: true, summary: true, summaryAr: true, trend: true, impactScore: true },
              });
              if (signal) {
                itemTitle = signal.title || '';
                itemTitleAr = signal.titleAr || '';
                itemDescription = signal.summaryAr || signal.summary || '';
                trend = signal.trend || '';
                impactScore = signal.impactScore || 0;
              }
              break;
            }
            case 'ARTICLE':
            case 'CONTENT': {
              const content = await prisma.content.findUnique({
                where: { id: fav.itemId },
                select: { title: true, titleAr: true, excerpt: true, excerptAr: true, featuredImage: true, viewCount: true, type: true },
              });
              if (content) {
                itemTitle = content.title || '';
                itemTitleAr = content.titleAr || '';
                itemDescription = content.excerptAr || content.excerpt || '';
                itemImage = content.featuredImage || '';
                viewCount = content.viewCount || 0;
                category = content.type || '';
              }
              break;
            }
            case 'DASHBOARD': {
              const dashboard = await prisma.dashboard.findUnique({
                where: { id: fav.itemId },
                select: { name: true, nameAr: true, description: true },
              });
              if (dashboard) {
                itemTitle = dashboard.name || '';
                itemTitleAr = dashboard.nameAr || '';
                itemDescription = dashboard.description || '';
              }
              break;
            }
          }
        } catch {
          // Item may have been deleted - that's ok
        }

        return {
          ...fav,
          itemTitle,
          itemTitleAr,
          itemDescription,
          itemImage,
          category,
          source,
          trend,
          impactScore,
          viewCount,
          recordCount,
        };
      })
    );

    sendPaginated(res, enriched, pageNum, limitNum, total);
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

/**
 * SSE Stream for notifications - WebFlux style
 */
export async function getNotificationsStream(
  req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const userId = req.user?.userId || (req.query.token ? undefined : null);

  // For SSE with token auth
  let resolvedUserId = userId;
  if (!resolvedUserId && req.query.token) {
    try {
      const jwt = await import('jsonwebtoken');
      const config = await import('../config/index.js');
      const decoded = jwt.default.verify(String(req.query.token), config.default.jwt.secret) as any;
      resolvedUserId = decoded.userId;
    } catch { /* ignore */ }
  }

  if (!resolvedUserId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent('connected', { message: 'Notifications stream connected' });

  // Send current notifications
  try {
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: resolvedUserId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      prisma.notification.count({ where: { userId: resolvedUserId, isRead: false } }),
    ]);

    sendEvent('notifications', { notifications, unreadCount });
  } catch (err) {
    sendEvent('error', { message: 'Failed to load notifications' });
  }

  // Poll for new notifications every 10 seconds
  let lastCheck = new Date();
  const interval = setInterval(async () => {
    try {
      const newNotifications = await prisma.notification.findMany({
        where: { userId: resolvedUserId!, createdAt: { gt: lastCheck } },
        orderBy: { createdAt: 'desc' },
      });
      if (newNotifications.length > 0) {
        const unreadCount = await prisma.notification.count({ where: { userId: resolvedUserId!, isRead: false } });
        sendEvent('new_notifications', { notifications: newNotifications, unreadCount });
      }
      lastCheck = new Date();
    } catch { /* ignore */ }
  }, 10000);

  // Keepalive
  const keepalive = setInterval(() => {
    res.write(':keepalive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(interval);
    clearInterval(keepalive);
  });
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
  getNotificationsStream,
};
