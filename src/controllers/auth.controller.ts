import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../services/email.js';
import type { JwtPayload } from '../middleware/auth.js';

// Validation schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  nameAr: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

function generateVerificationToken(userId: string): string {
  return jwt.sign({ userId, purpose: 'email-verify' }, config.jwt.secret, {
    expiresIn: '24h',
  } as jwt.SignOptions);
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = registerSchema.parse(req.body);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (existingUser) {
      sendError(
        res,
        'Email already registered',
        'البريد الإلكتروني مسجل مسبقاً',
        409
      );
      return;
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(data.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        name: data.name,
        nameAr: data.nameAr,
      },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info(`New user registered: ${user.email}`);

    // Send verification email (fire-and-forget)
    const verifyToken = generateVerificationToken(user.id);
    sendVerificationEmail(user.email, verifyToken, user.name).catch((err) => {
      logger.error('Failed to send verification email:', err);
    });

    sendSuccess(res, { user, token }, 201);
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = loginSchema.parse(req.body);

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      sendError(
        res,
        'Invalid email or password',
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        401
      );
      return;
    }

    // Check if user is active
    if (!user.isActive) {
      sendError(
        res,
        'Account is disabled',
        'الحساب معطل',
        403
      );
      return;
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(data.password, user.password);

    if (!isValidPassword) {
      sendError(
        res,
        'Invalid email or password',
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
        401
      );
      return;
    }

    // Generate token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info(`User logged in: ${user.email}`);

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nameAr: user.nameAr,
        avatar: user.avatar,
        role: user.role,
      },
      token,
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        bio: true,
        bioAr: true,
        phone: true,
        emailVerified: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            dashboards: true,
            favorites: true,
            contents: true,
            comments: true,
            following: true,
            followers: true,
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

export async function updateMe(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const updateSchema = z.object({
      name: z.string().min(2).optional(),
      nameAr: z.string().optional(),
      avatar: z.string().url().optional().nullable(),
      bio: z.string().max(500).optional().nullable(),
      bioAr: z.string().max(500).optional().nullable(),
      phone: z.string().max(20).optional().nullable(),
    });

    const data = updateSchema.parse(req.body);

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        bio: true,
        bioAr: true,
        phone: true,
        updatedAt: true,
      },
    });

    sendSuccess(res, user);
  } catch (error) {
    next(error);
  }
}

export async function getPublicProfile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId } = req.params;

    const user = await prisma.user.findUnique({
      where: { id: userId, isActive: true },
      select: {
        id: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        bio: true,
        bioAr: true,
        createdAt: true,
        _count: {
          select: {
            contents: true,
            comments: true,
            following: true,
            followers: true,
          },
        },
      },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    // Get recent published content by this user
    const recentContent = await prisma.content.findMany({
      where: { authorId: userId, status: 'PUBLISHED' },
      select: {
        id: true,
        type: true,
        title: true,
        titleAr: true,
        excerptAr: true,
        viewCount: true,
        likeCount: true,
        publishedAt: true,
      },
      orderBy: { publishedAt: 'desc' },
      take: 5,
    });

    sendSuccess(res, { ...user, recentContent });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'New password must be at least 8 characters'),
    });

    const data = schema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    const isValid = await bcrypt.compare(data.currentPassword, user.password);

    if (!isValid) {
      sendError(
        res,
        'Current password is incorrect',
        'كلمة المرور الحالية غير صحيحة',
        400
      );
      return;
    }

    const hashedPassword = await bcrypt.hash(data.newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    logger.info(`Password changed for user: ${user.email}`);

    sendSuccess(res, { message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
}

export async function forgotPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      email: z.string().email('Invalid email format'),
    });

    const data = schema.parse(req.body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      select: { id: true, name: true, email: true, isActive: true },
    });

    // Always return success to prevent email enumeration
    if (!user || !user.isActive) {
      sendSuccess(res, {
        message: 'If this email exists, a password reset link has been sent',
        messageAr: 'إذا كان هذا البريد مسجلاً، سيتم إرسال رابط استعادة كلمة المرور',
      });
      return;
    }

    // Invalidate existing tokens for this user
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt,
      },
    });

    // Send reset email
    await sendPasswordResetEmail(user.email, token, user.name);

    logger.info(`Password reset requested for: ${user.email}`);

    sendSuccess(res, {
      message: 'If this email exists, a password reset link has been sent',
      messageAr: 'إذا كان هذا البريد مسجلاً، سيتم إرسال رابط استعادة كلمة المرور',
    });
  } catch (error) {
    next(error);
  }
}

export async function resetPassword(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      token: z.string().min(1, 'Token is required'),
      newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    });

    const data = schema.parse(req.body);

    // Find valid token
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token: data.token },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!resetToken) {
      sendError(
        res,
        'Invalid or expired reset token',
        'رمز الاستعادة غير صالح أو منتهي الصلاحية',
        400
      );
      return;
    }

    // Check if token is expired or already used
    if (resetToken.usedAt || resetToken.expiresAt < new Date()) {
      sendError(
        res,
        'Reset token has expired',
        'انتهت صلاحية رمز الاستعادة',
        400
      );
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(data.newPassword, 12);

    // Update password and mark token as used
    await Promise.all([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    logger.info(`Password reset completed for: ${resetToken.user.email}`);

    sendSuccess(res, {
      message: 'Password has been reset successfully',
      messageAr: 'تم إعادة تعيين كلمة المرور بنجاح',
    });
  } catch (error) {
    next(error);
  }
}

export async function refreshToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Re-read user from DB to get latest role/status
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      sendError(res, 'User not found or inactive', 'المستخدم غير موجود أو غير نشط', 401);
      return;
    }

    // Generate fresh token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    sendSuccess(res, { token });
  } catch (error) {
    next(error);
  }
}

export async function sendVerification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, emailVerified: true },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    if (user.emailVerified) {
      sendSuccess(res, {
        message: 'Email already verified',
        messageAr: 'البريد الإلكتروني مؤكد بالفعل',
      });
      return;
    }

    const token = generateVerificationToken(user.id);
    await sendVerificationEmail(user.email, token, user.name);

    logger.info(`Verification email sent to: ${user.email}`);

    sendSuccess(res, {
      message: 'Verification email sent',
      messageAr: 'تم إرسال رسالة التأكيد إلى بريدك الإلكتروني',
    });
  } catch (error) {
    next(error);
  }
}

export async function verifyEmail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const schema = z.object({
      token: z.string().min(1, 'Token is required'),
    });

    const data = schema.parse(req.body);

    let decoded: { userId: string; purpose: string };
    try {
      decoded = jwt.verify(data.token, config.jwt.secret) as { userId: string; purpose: string };
    } catch {
      sendError(res, 'Invalid or expired verification token', 'رمز التأكيد غير صالح أو منتهي الصلاحية', 400);
      return;
    }

    if (decoded.purpose !== 'email-verify') {
      sendError(res, 'Invalid token type', 'نوع الرمز غير صالح', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, emailVerified: true },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    if (user.emailVerified) {
      sendSuccess(res, {
        message: 'Email already verified',
        messageAr: 'البريد الإلكتروني مؤكد بالفعل',
      });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true },
    });

    logger.info(`Email verified for: ${user.email}`);

    sendSuccess(res, {
      message: 'Email verified successfully',
      messageAr: 'تم تأكيد البريد الإلكتروني بنجاح',
    });
  } catch (error) {
    next(error);
  }
}

export default { register, login, getMe, updateMe, changePassword, forgotPassword, resetPassword, getPublicProfile, refreshToken, sendVerification, verifyEmail };
