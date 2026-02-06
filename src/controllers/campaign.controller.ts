/**
 * Campaign Controller - الحملات التفاعلية
 * Polls, surveys, quizzes, and contests management
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

const createCampaignSchema = z.object({
  title: z.string().min(1).max(200),
  titleAr: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  descriptionAr: z.string().max(2000).optional(),
  type: z.enum(['POLL', 'SURVEY', 'QUIZ', 'CONTEST']).default('POLL'),
  settings: z.string().optional(), // JSON string with questions/options
  coverImage: z.string().url().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

/**
 * POST /campaigns
 * Create a new campaign (CONTENT_MANAGER, ADMIN)
 */
export async function createCampaign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const data = createCampaignSchema.parse(req.body);

    const campaign = await prisma.campaign.create({
      data: {
        ...data,
        settings: data.settings || '{"questions":[]}',
        createdBy: userId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
      },
    });

    logger.info(`Campaign created: ${campaign.id} by ${userId}`);
    sendSuccess(res, campaign, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /campaigns
 * List campaigns (public: active only, admin: all)
 */
export async function getCampaigns(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const role = (req as any).user?.role;
    const isManager = role && ['CONTENT_MANAGER', 'ADMIN', 'SUPER_ADMIN'].includes(role.toUpperCase());

    const where = isManager ? {} : { status: 'ACTIVE' };

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        _count: { select: { responses: true } },
      },
    });

    sendSuccess(res, campaigns);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /campaigns/:id
 * Get campaign details
 */
export async function getCampaign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { responses: true } },
      },
    });

    if (!campaign) {
      sendError(res, 'Campaign not found', 'الحملة غير موجودة', 404);
      return;
    }

    sendSuccess(res, campaign);
  } catch (error) {
    next(error);
  }
}

/**
 * PUT /campaigns/:id
 * Update campaign
 */
export async function updateCampaign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const data = createCampaignSchema.partial().parse(req.body);

    const campaign = await prisma.campaign.update({
      where: { id },
      data: {
        ...data,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
      },
    });

    sendSuccess(res, campaign);
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /campaigns/:id/status
 * Update campaign status
 */
export async function updateCampaignStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['DRAFT', 'ACTIVE', 'PAUSED', 'ENDED'].includes(status)) {
      sendError(res, 'Invalid status', 'الحالة غير صالحة', 400);
      return;
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: { status },
    });

    logger.info(`Campaign ${id} status updated to ${status}`);
    sendSuccess(res, campaign);
  } catch (error) {
    next(error);
  }
}

/**
 * DELETE /campaigns/:id
 */
export async function deleteCampaign(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    await prisma.campaign.delete({ where: { id } });

    sendSuccess(res, { deleted: true });
  } catch (error) {
    next(error);
  }
}

const submitResponseSchema = z.object({
  answers: z.string(), // JSON string
});

/**
 * POST /campaigns/:id/respond
 * Submit a response to a campaign
 */
export async function submitResponse(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId || null;
    const { answers } = submitResponseSchema.parse(req.body);

    const campaign = await prisma.campaign.findUnique({ where: { id } });

    if (!campaign || campaign.status !== 'ACTIVE') {
      sendError(res, 'Campaign not available', 'الحملة غير متاحة', 404);
      return;
    }

    // Check if already responded (for logged-in users)
    if (userId) {
      const existing = await prisma.campaignResponse.findFirst({
        where: { campaignId: id, userId },
      });
      if (existing) {
        sendError(res, 'Already responded', 'سبق وشاركت في هذه الحملة', 409);
        return;
      }
    }

    // Calculate score for quiz type
    let score = null;
    if (campaign.type === 'QUIZ') {
      try {
        const settings = JSON.parse(campaign.settings);
        const userAnswers = JSON.parse(answers);
        score = 0;
        for (const q of (settings.questions || [])) {
          if (q.correctAnswer !== undefined && userAnswers[q.id] === q.correctAnswer) {
            score++;
          }
        }
      } catch { /* ignore parsing errors */ }
    }

    const response = await prisma.campaignResponse.create({
      data: {
        campaignId: id,
        userId,
        answers,
        score,
      },
    });

    // Update participant count
    await prisma.campaign.update({
      where: { id },
      data: { participantCount: { increment: 1 } },
    });

    sendSuccess(res, { response, score }, 201);
  } catch (error) {
    next(error);
  }
}

/**
 * GET /campaigns/:id/results
 * Get campaign results (managers only)
 */
export async function getCampaignResults(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      sendError(res, 'Campaign not found', 'الحملة غير موجودة', 404);
      return;
    }

    const responses = await prisma.campaignResponse.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Aggregate answers
    const settings = JSON.parse(campaign.settings || '{}');
    const questions = settings.questions || [];
    const aggregated: Record<string, Record<string, number>> = {};

    for (const resp of responses) {
      try {
        const answers = JSON.parse(resp.answers);
        for (const [qId, answer] of Object.entries(answers)) {
          if (!aggregated[qId]) aggregated[qId] = {};
          const ansStr = String(answer);
          aggregated[qId][ansStr] = (aggregated[qId][ansStr] || 0) + 1;
        }
      } catch { /* ignore */ }
    }

    sendSuccess(res, {
      campaign,
      totalResponses: responses.length,
      aggregated,
      responses: responses.slice(0, 100),
    });
  } catch (error) {
    next(error);
  }
}
