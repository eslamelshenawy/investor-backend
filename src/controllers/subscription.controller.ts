/**
 * Subscription Controller - إدارة الاشتراكات
 * Handles subscription management and Moyasar payment integration
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';

// Plan definitions
const PLANS = {
  FREE: {
    id: 'FREE',
    nameAr: 'مجاني',
    nameEn: 'Free',
    monthlyPrice: 0,
    annualPrice: 0,
    features: ['browse_dashboards', 'limited_signals', 'basic_search'],
    limits: { favorites: 10, dashboards: 0, exports: 0 },
  },
  ANALYST: {
    id: 'ANALYST',
    nameAr: 'محلل',
    nameEn: 'Analyst',
    monthlyPrice: 9900, // 99 SAR in halalas
    annualPrice: 99000, // 990 SAR (2 months free)
    features: ['browse_dashboards', 'full_signals', 'advanced_search', 'create_dashboards', 'custom_queries', 'export_data', 'ai_recommendations', 'instant_alerts'],
    limits: { favorites: 50, dashboards: 10, exports: 100 },
  },
  EXPERT: {
    id: 'EXPERT',
    nameAr: 'خبير',
    nameEn: 'Expert',
    monthlyPrice: 29900, // 299 SAR
    annualPrice: 299000, // 2990 SAR (2 months free)
    features: ['browse_dashboards', 'full_signals', 'advanced_search', 'create_dashboards', 'custom_queries', 'export_data', 'ai_recommendations', 'instant_alerts', 'expert_studio', 'custom_reports', 'verification_tools', 'full_api', 'priority_support'],
    limits: { favorites: -1, dashboards: -1, exports: -1 }, // -1 = unlimited
  },
} as const;

type PlanKey = keyof typeof PLANS;

/**
 * GET /subscriptions/plans
 * Get available subscription plans
 */
export async function getPlans(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const plans = Object.values(PLANS).map(plan => ({
      id: plan.id,
      nameAr: plan.nameAr,
      nameEn: plan.nameEn,
      monthlyPrice: plan.monthlyPrice,
      annualPrice: plan.annualPrice,
      features: plan.features,
      limits: plan.limits,
    }));

    sendSuccess(res, { plans });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /subscriptions/my
 * Get current user's subscription info
 */
export async function getMySubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionPlan: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        trialEndsAt: true,
      },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    // Get active subscription
    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: { in: ['ACTIVE', 'CANCELLED'] } },
      orderBy: { createdAt: 'desc' },
    });

    // Get recent payments
    const payments = await prisma.payment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        paymentMethod: true,
        description: true,
        descriptionAr: true,
        paidAt: true,
        createdAt: true,
      },
    });

    const plan = PLANS[user.subscriptionPlan as PlanKey] || PLANS.FREE;

    sendSuccess(res, {
      plan: {
        id: plan.id,
        nameAr: plan.nameAr,
        nameEn: plan.nameEn,
        features: plan.features,
        limits: plan.limits,
      },
      status: user.subscriptionStatus,
      endDate: user.subscriptionEnd,
      trialEndsAt: user.trialEndsAt,
      subscription,
      payments,
    });
  } catch (error) {
    next(error);
  }
}

const createPaymentSchema = z.object({
  plan: z.enum(['ANALYST', 'EXPERT']),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  callbackUrl: z.string().url(),
});

/**
 * POST /subscriptions/create-payment
 * Create a Moyasar payment session for subscription
 */
export async function createPayment(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const data = createPaymentSchema.parse(req.body);

    const plan = PLANS[data.plan];
    if (!plan) {
      sendError(res, 'Invalid plan', 'خطة غير صالحة', 400);
      return;
    }

    const amount = data.billingCycle === 'ANNUAL' ? plan.annualPrice : plan.monthlyPrice;

    if (amount === 0) {
      sendError(res, 'Cannot pay for free plan', 'لا يمكن الدفع للخطة المجانية', 400);
      return;
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        userId,
        amount,
        currency: 'SAR',
        status: 'PENDING',
        description: `Subscription: ${plan.nameEn} (${data.billingCycle})`,
        descriptionAr: `اشتراك: ${plan.nameAr} (${data.billingCycle === 'ANNUAL' ? 'سنوي' : 'شهري'})`,
      },
    });

    const moyasarKey = config.moyasar.publishableKey;
    const moyasarSecret = config.moyasar.secretKey;

    if (!moyasarKey || !moyasarSecret) {
      // If no Moyasar keys, simulate payment for development
      logger.warn('Moyasar keys not configured - simulating payment');
      sendSuccess(res, {
        paymentId: payment.id,
        mode: 'simulation',
        plan: data.plan,
        billingCycle: data.billingCycle,
        amount,
        currency: 'SAR',
      });
      return;
    }

    // Create Moyasar payment
    const moyasarPayload = {
      amount,
      currency: 'SAR',
      description: payment.descriptionAr,
      callback_url: data.callbackUrl,
      metadata: {
        paymentId: payment.id,
        userId,
        plan: data.plan,
        billingCycle: data.billingCycle,
      },
      source: {
        type: 'creditcard',
      },
    };

    try {
      const moyasarRes = await fetch('https://api.moyasar.com/v1/payments', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(moyasarSecret + ':').toString('base64')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(moyasarPayload),
      });

      const moyasarData = await moyasarRes.json() as any;

      if (moyasarData.id) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { gatewayId: moyasarData.id },
        });

        sendSuccess(res, {
          paymentId: payment.id,
          gatewayId: moyasarData.id,
          mode: 'live',
          paymentUrl: moyasarData.source?.transaction_url || null,
          amount,
          currency: 'SAR',
        });
      } else {
        sendError(res, 'Payment creation failed', 'فشل إنشاء الدفعة', 500);
      }
    } catch (err) {
      logger.error('Moyasar API error:', err);
      sendError(res, 'Payment gateway error', 'خطأ في بوابة الدفع', 500);
    }
  } catch (error) {
    next(error);
  }
}

/**
 * POST /subscriptions/activate
 * Activate subscription after successful payment (or simulate for dev)
 */
export async function activateSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { paymentId, plan, billingCycle } = req.body;

    if (!plan || !['ANALYST', 'EXPERT'].includes(plan)) {
      sendError(res, 'Invalid plan', 'خطة غير صالحة', 400);
      return;
    }

    const planDef = PLANS[plan as PlanKey];
    const cycle = billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
    const amount = cycle === 'ANNUAL' ? planDef.annualPrice : planDef.monthlyPrice;

    // Calculate end date
    const now = new Date();
    const endDate = new Date(now);
    if (cycle === 'ANNUAL') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    } else {
      endDate.setMonth(endDate.getMonth() + 1);
    }

    // Create subscription
    const subscription = await prisma.subscription.create({
      data: {
        userId,
        plan,
        status: 'ACTIVE',
        billingCycle: cycle,
        amount,
        startDate: now,
        endDate,
      },
    });

    // Update payment if provided
    if (paymentId) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: 'PAID',
          paidAt: now,
          subscriptionId: subscription.id,
        },
      }).catch(() => {});
    }

    // Update user subscription fields
    await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlan: plan,
        subscriptionStatus: 'ACTIVE',
        subscriptionEnd: endDate,
      },
    });

    logger.info(`Subscription activated: ${userId} -> ${plan} (${cycle})`);

    sendSuccess(res, {
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        status: subscription.status,
        billingCycle: subscription.billingCycle,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /subscriptions/cancel
 * Cancel current subscription (active until end of billing period)
 */
export async function cancelSubscription(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { reason } = req.body;

    const subscription = await prisma.subscription.findFirst({
      where: { userId, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      sendError(res, 'No active subscription', 'لا يوجد اشتراك نشط', 404);
      return;
    }

    // Mark as cancelled but keep active until end date
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason || null,
      },
    });

    await prisma.user.update({
      where: { id: userId },
      data: { subscriptionStatus: 'CANCELLED' },
    });

    logger.info(`Subscription cancelled: ${userId}`);

    sendSuccess(res, {
      message: 'Subscription cancelled',
      messageAr: 'تم إلغاء الاشتراك',
      endDate: subscription.endDate,
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /subscriptions/webhook
 * Moyasar webhook for payment status updates
 */
export async function paymentWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id, status, metadata, amount, source } = req.body;

    logger.info(`Payment webhook received: ${id} - ${status}`);

    if (!metadata?.paymentId) {
      res.status(200).json({ received: true });
      return;
    }

    const payment = await prisma.payment.findUnique({
      where: { id: metadata.paymentId },
    });

    if (!payment) {
      res.status(200).json({ received: true });
      return;
    }

    // Update payment
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        gatewayId: id,
        status: status === 'paid' ? 'PAID' : status === 'failed' ? 'FAILED' : payment.status,
        paymentMethod: source?.type || null,
        gatewayResponse: JSON.stringify(req.body),
        paidAt: status === 'paid' ? new Date() : null,
      },
    });

    // If paid, activate subscription
    if (status === 'paid' && metadata.plan) {
      const cycle = metadata.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY';
      const now = new Date();
      const endDate = new Date(now);
      if (cycle === 'ANNUAL') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      } else {
        endDate.setMonth(endDate.getMonth() + 1);
      }

      const subscription = await prisma.subscription.create({
        data: {
          userId: payment.userId,
          plan: metadata.plan,
          status: 'ACTIVE',
          billingCycle: cycle,
          amount: amount || payment.amount,
          startDate: now,
          endDate,
        },
      });

      await prisma.payment.update({
        where: { id: payment.id },
        data: { subscriptionId: subscription.id },
      });

      await prisma.user.update({
        where: { id: payment.userId },
        data: {
          subscriptionPlan: metadata.plan,
          subscriptionStatus: 'ACTIVE',
          subscriptionEnd: endDate,
        },
      });

      logger.info(`Subscription activated via webhook: ${payment.userId} -> ${metadata.plan}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(200).json({ received: true });
  }
}

/**
 * GET /subscriptions/check-feature/:feature
 * Check if user has access to a specific feature
 */
export async function checkFeature(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = (req as any).user.userId;
    const { feature } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true, subscriptionStatus: true, subscriptionEnd: true, trialEndsAt: true },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    // Check if subscription is still valid
    let effectivePlan = user.subscriptionPlan || 'FREE';
    if (effectivePlan !== 'FREE' && user.subscriptionEnd && new Date(user.subscriptionEnd) < new Date()) {
      effectivePlan = 'FREE';
    }

    // Check trial
    if (effectivePlan === 'FREE' && user.trialEndsAt && new Date(user.trialEndsAt) > new Date()) {
      effectivePlan = 'ANALYST'; // Trial gives Analyst access
    }

    const plan = PLANS[effectivePlan as PlanKey] || PLANS.FREE;
    const hasAccess = plan.features.includes(feature);

    sendSuccess(res, { hasAccess, currentPlan: effectivePlan, feature });
  } catch (error) {
    next(error);
  }
}
