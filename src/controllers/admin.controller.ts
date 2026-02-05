/**
 * Admin Controller - وحدة تحكم الإدارة
 * Handles admin operations like job triggering, stats, etc.
 */

import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../services/database.js';
import {
  getJobStatus,
  triggerFullSync,
  triggerPortalSync,
  triggerAIAnalysis,
  triggerContentGeneration,
} from '../jobs/scheduler.js';
import { sendSuccess, sendPaginated, sendError } from '../utils/response.js';

const VALID_ROLES = ['USER', 'ANALYST', 'EXPERT', 'WRITER', 'DESIGNER', 'EDITOR', 'CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'];

// Get system stats
export async function getSystemStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const [
      totalUsers,
      totalDatasets,
      totalSignals,
      activeSignals,
      totalContent,
      recentSyncs,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.dataset.count(),
      prisma.signal.count(),
      prisma.signal.count({ where: { isActive: true } }),
      prisma.content.count(),
      prisma.syncLog.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
    ]);

    const stats = {
      users: {
        total: totalUsers,
      },
      datasets: {
        total: totalDatasets,
      },
      signals: {
        total: totalSignals,
        active: activeSignals,
      },
      content: {
        total: totalContent,
      },
      recentSyncs,
      jobs: getJobStatus(),
    };

    sendSuccess(res, stats);
  } catch (error) {
    next(error);
  }
}

// Get job status
export async function getJobsStatus(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const status = getJobStatus();
    sendSuccess(res, status);
  } catch (error) {
    next(error);
  }
}

// Trigger data sync
export async function triggerSync(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await triggerFullSync();
    sendSuccess(res, result, 'Sync triggered successfully', 'تم تشغيل المزامنة بنجاح');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already running')) {
      sendError(res, 'Sync already running', 'المزامنة قيد التشغيل بالفعل', 409);
      return;
    }
    next(error);
  }
}

// Trigger AI analysis
export async function triggerAnalysis(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await triggerAIAnalysis();
    sendSuccess(res, result, 'Analysis triggered successfully', 'تم تشغيل التحليل بنجاح');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already running')) {
      sendError(res, 'Analysis already running', 'التحليل قيد التشغيل بالفعل', 409);
      return;
    }
    next(error);
  }
}

// Trigger content generation
export async function triggerContent(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await triggerContentGeneration();
    sendSuccess(res, result, 'Content generation triggered', 'تم تشغيل توليد المحتوى');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already running')) {
      sendError(res, 'Content generation already running', 'توليد المحتوى قيد التشغيل', 409);
      return;
    }
    next(error);
  }
}

// Trigger portal sync (Browserless)
export async function triggerPortal(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await triggerPortalSync();
    sendSuccess(res, result, 'Portal sync triggered successfully', 'تم تشغيل المزامنة من المنصة بنجاح');
  } catch (error) {
    if (error instanceof Error && error.message.includes('already running')) {
      sendError(res, 'Portal sync already running', 'المزامنة من المنصة قيد التشغيل بالفعل', 409);
      return;
    }
    next(error);
  }
}

// Get all users with search, filter, sort
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '20', search, role, isActive, sort = 'createdAt', order = 'desc' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};

    if (search) {
      const searchStr = String(search);
      where.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { nameAr: { contains: searchStr, mode: 'insensitive' } },
        { email: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    if (role) where.role = String(role);
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const orderBy: Record<string, string> = {};
    const sortField = ['createdAt', 'name', 'email', 'role', 'lastLoginAt'].includes(String(sort)) ? String(sort) : 'createdAt';
    orderBy[sortField] = order === 'asc' ? 'asc' : 'desc';

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limitNum,
        orderBy,
        select: {
          id: true,
          email: true,
          name: true,
          nameAr: true,
          avatar: true,
          role: true,
          isActive: true,
          emailVerified: true,
          lastLoginAt: true,
          bio: true,
          phone: true,
          createdAt: true,
          _count: {
            select: {
              contents: true,
              comments: true,
              dashboards: true,
            },
          },
        },
      }),
      prisma.user.count({ where }),
    ]);

    sendPaginated(res, users, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get single user details
export async function getUserDetails(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        isActive: true,
        emailVerified: true,
        lastLoginAt: true,
        bio: true,
        bioAr: true,
        phone: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            contents: true,
            comments: true,
            dashboards: true,
            favorites: true,
            contentLikes: true,
            contentSaves: true,
          },
        },
      },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

// Create new user (admin)
export async function createUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { email, password, name, nameAr, role, bio, bioAr, phone, avatar } = req.body;

    if (!email || !password || !name) {
      sendError(res, 'Email, password, and name are required', 'البريد وكلمة المرور والاسم مطلوبة', 400);
      return;
    }

    if (role && !VALID_ROLES.includes(role)) {
      sendError(res, `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}`, 'دور غير صالح', 400);
      return;
    }

    // Check email uniqueness
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      sendError(res, 'Email already in use', 'البريد الإلكتروني مستخدم بالفعل', 409);
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        nameAr: nameAr || null,
        role: role || 'USER',
        bio: bio || null,
        bioAr: bioAr || null,
        phone: phone || null,
        avatar: avatar || null,
        emailVerified: true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Create audit log
    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: 'USER_CREATED',
        targetType: 'User',
        targetId: user.id,
        details: JSON.stringify({ role: user.role, email: user.email }),
      },
    });

    sendSuccess(res, user, 'User created successfully', 'تم إنشاء المستخدم بنجاح');
  } catch (error) {
    next(error);
  }
}

// Update user details
export async function updateUser(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const { name, nameAr, email, bio, bioAr, phone, avatar } = req.body;

    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    // Check email uniqueness if changing
    if (email && email !== existing.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email } });
      if (emailTaken) {
        sendError(res, 'Email already in use', 'البريد الإلكتروني مستخدم بالفعل', 409);
        return;
      }
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (nameAr !== undefined) updateData.nameAr = nameAr;
    if (email !== undefined) updateData.email = email;
    if (bio !== undefined) updateData.bio = bio;
    if (bioAr !== undefined) updateData.bioAr = bioAr;
    if (phone !== undefined) updateData.phone = phone;
    if (avatar !== undefined) updateData.avatar = avatar;

    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true, email: true, name: true, nameAr: true, avatar: true,
        role: true, isActive: true, bio: true, phone: true, createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: 'USER_UPDATED',
        targetType: 'User',
        targetId: userId,
        details: JSON.stringify({ fields: Object.keys(updateData) }),
      },
    });

    sendSuccess(res, user, 'User updated', 'تم تحديث المستخدم');
  } catch (error) {
    next(error);
  }
}

// Update user role (supports all 9 roles)
export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!VALID_ROLES.includes(role)) {
      sendError(res, `Invalid role. Valid roles: ${VALID_ROLES.join(', ')}`, 'دور غير صالح', 400);
      return;
    }

    // Prevent changing own role
    if (userId === req.user!.userId) {
      sendError(res, 'Cannot change your own role', 'لا يمكنك تغيير دورك الخاص', 400);
      return;
    }

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!existing) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: { id: true, email: true, name: true, role: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: 'ROLE_CHANGED',
        targetType: 'User',
        targetId: userId,
        details: JSON.stringify({ oldRole: existing.role, newRole: role }),
      },
    });

    sendSuccess(res, user, 'User role updated', 'تم تحديث دور المستخدم');
  } catch (error) {
    next(error);
  }
}

// Toggle user active status
export async function toggleUserStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;

    if (userId === req.user!.userId) {
      sendError(res, 'Cannot deactivate yourself', 'لا يمكنك تعطيل حسابك', 400);
      return;
    }

    const existing = await prisma.user.findUnique({ where: { id: userId }, select: { isActive: true } });
    if (!existing) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { isActive: !existing.isActive },
      select: { id: true, email: true, name: true, isActive: true },
    });

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: user.isActive ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
        targetType: 'User',
        targetId: userId,
      },
    });

    const msg = user.isActive ? 'User activated' : 'User deactivated';
    const msgAr = user.isActive ? 'تم تفعيل المستخدم' : 'تم تعطيل المستخدم';
    sendSuccess(res, user, msg, msgAr);
  } catch (error) {
    next(error);
  }
}

// Bulk user action
export async function bulkUserAction(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userIds, action, role } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      sendError(res, 'userIds array is required', 'مصفوفة المستخدمين مطلوبة', 400);
      return;
    }

    // Prevent acting on self
    const filteredIds = userIds.filter((id: string) => id !== req.user!.userId);

    let result;
    switch (action) {
      case 'activate':
        result = await prisma.user.updateMany({ where: { id: { in: filteredIds } }, data: { isActive: true } });
        break;
      case 'deactivate':
        result = await prisma.user.updateMany({ where: { id: { in: filteredIds } }, data: { isActive: false } });
        break;
      case 'change_role':
        if (!role || !VALID_ROLES.includes(role)) {
          sendError(res, 'Valid role is required for change_role action', 'الدور مطلوب', 400);
          return;
        }
        result = await prisma.user.updateMany({ where: { id: { in: filteredIds } }, data: { role } });
        break;
      default:
        sendError(res, 'Invalid action. Use: activate, deactivate, change_role', 'إجراء غير صالح', 400);
        return;
    }

    await prisma.auditLog.create({
      data: {
        actorId: req.user!.userId,
        action: `BULK_${action.toUpperCase()}`,
        targetType: 'User',
        targetId: filteredIds.join(','),
        details: JSON.stringify({ count: result.count, role }),
      },
    });

    sendSuccess(res, { affected: result.count }, 'Bulk action completed', 'تم تنفيذ الإجراء الجماعي');
  } catch (error) {
    next(error);
  }
}

// Get audit logs
export async function getAuditLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '50', action, targetType } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {};
    if (action) where.action = String(action);
    if (targetType) where.targetType = String(targetType);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    sendPaginated(res, logs, pageNum, limitNum, total);
  } catch (error) {
    next(error);
  }
}

// Get sync logs
export async function getSyncLogs(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      prisma.syncLog.findMany({
        skip,
        take: limitNum,
        orderBy: { startedAt: 'desc' },
      }),
      prisma.syncLog.count(),
    ]);

    sendSuccess(res, { logs, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
}

// SSE Stream: Get all users as a stream
export async function getUsersStream(req: Request, res: Response, _next: NextFunction): Promise<void> {
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
    const { search, role, isActive } = req.query;
    const where: Record<string, unknown> = {};
    if (role) where.role = String(role);
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { nameAr: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const total = await prisma.user.count({ where });
    sendEvent('start', { message: 'جاري تحميل المستخدمين...', total, timestamp: new Date() });

    const users = await prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, name: true, nameAr: true, avatar: true,
        role: true, isActive: true, emailVerified: true, lastLoginAt: true,
        bio: true, phone: true, createdAt: true,
        _count: { select: { contents: true, comments: true, dashboards: true } },
      },
    });

    for (const user of users) {
      sendEvent('user', user);
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    sendEvent('complete', { message: 'تم تحميل جميع المستخدمين', total: users.length });
    res.end();
  } catch (error) {
    sendEvent('error', { message: 'حدث خطأ في تحميل المستخدمين', error: String(error) });
    res.end();
  }
}

export default {
  getSystemStats,
  getJobsStatus,
  triggerSync,
  triggerPortal,
  triggerAnalysis,
  triggerContent,
  getUsers,
  getUsersStream,
  getUserDetails,
  createUser,
  updateUser,
  updateUserRole,
  toggleUserStatus,
  bulkUserAction,
  getAuditLogs,
  getSyncLogs,
};
