import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
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
        emailVerified: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            dashboards: true,
            favorites: true,
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
        updatedAt: true,
      },
    });

    sendSuccess(res, user);
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

export default { register, login, getMe, updateMe, changePassword };
