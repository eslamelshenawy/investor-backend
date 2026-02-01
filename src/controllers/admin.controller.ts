/**
 * Admin Controller - وحدة تحكم الإدارة
 * Handles admin operations like job triggering, stats, etc.
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/database.js';
import {
  getJobStatus,
  triggerFullSync,
  triggerPortalSync,
  triggerAIAnalysis,
  triggerContentGeneration,
} from '../jobs/scheduler.js';
import { sendSuccess, sendError } from '../utils/response.js';

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

// Get all users (admin only)
export async function getUsers(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { page = '1', limit = '20' } = req.query;
    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
          lastLoginAt: true,
        },
      }),
      prisma.user.count(),
    ]);

    sendSuccess(res, { users, total, page: pageNum, limit: limitNum });
  } catch (error) {
    next(error);
  }
}

// Update user role
export async function updateUserRole(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!['USER', 'ANALYST', 'EXPERT', 'WRITER', 'ADMIN'].includes(role)) {
      sendError(res, 'Invalid role', 'دور غير صالح', 400);
      return;
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    sendSuccess(res, user, 'User role updated', 'تم تحديث دور المستخدم');
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

export default {
  getSystemStats,
  getJobsStatus,
  triggerSync,
  triggerPortal,
  triggerAnalysis,
  triggerContent,
  getUsers,
  updateUserRole,
  getSyncLogs,
};
