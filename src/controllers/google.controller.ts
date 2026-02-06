/**
 * Google OAuth Controller
 * Handles Google Sign-In via ID token verification
 */

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../services/database.js';
import { config } from '../config/index.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import type { JwtPayload } from '../middleware/auth.js';

const client = new OAuth2Client(config.google.clientId);

function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  } as jwt.SignOptions);
}

const googleAuthSchema = z.object({
  credential: z.string().min(1, 'Google credential is required'),
});

/**
 * POST /auth/google
 * Authenticate with Google ID token (from Google Sign-In)
 * - If user exists with same email → login
 * - If no user → create new account
 */
export async function googleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { credential } = googleAuthSchema.parse(req.body);

    // Verify the Google ID token
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken: credential,
        audience: config.google.clientId,
      });
      payload = ticket.getPayload();
    } catch {
      sendError(res, 'Invalid Google token', 'رمز Google غير صالح', 401);
      return;
    }

    if (!payload || !payload.email) {
      sendError(res, 'Invalid Google token payload', 'بيانات Google غير صالحة', 401);
      return;
    }

    const { email, name, picture, sub: googleId } = payload;

    // Check if user exists with this email
    let user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        nameAr: true,
        avatar: true,
        role: true,
        isActive: true,
        emailVerified: true,
        provider: true,
        providerId: true,
        twoFactorEnabled: true,
      },
    });

    let isNewUser = false;

    if (user) {
      // Existing user - check if active
      if (!user.isActive) {
        sendError(res, 'Account is disabled', 'الحساب معطل', 403);
        return;
      }

      // Link Google provider if not already linked
      if (!user.provider) {
        await prisma.user.update({
          where: { id: user.id },
          data: { provider: 'google', providerId: googleId },
        });
      }

      // If 2FA is enabled, require 2FA verification
      if (user.twoFactorEnabled) {
        sendSuccess(res, { requires2FA: true, userId: user.id });
        return;
      }
    } else {
      // New user - create account
      // Generate a random password (user won't need it for Google login)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const hashedPassword = await bcrypt.hash(randomPassword, 12);

      user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name: name || email.split('@')[0],
          avatar: picture || null,
          provider: 'google',
          providerId: googleId,
          emailVerified: true, // Google emails are verified
        },
        select: {
          id: true,
          email: true,
          name: true,
          nameAr: true,
          avatar: true,
          role: true,
          isActive: true,
          emailVerified: true,
          provider: true,
          providerId: true,
          twoFactorEnabled: true,
        },
      });

      isNewUser = true;
      logger.info(`New user registered via Google: ${email}`);
    }

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    logger.info(`User logged in via Google: ${user.email}`);

    sendSuccess(res, {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        nameAr: user.nameAr,
        avatar: user.avatar,
        role: user.role,
        emailVerified: user.emailVerified,
      },
      token,
      isNewUser,
    });
  } catch (error) {
    next(error);
  }
}
