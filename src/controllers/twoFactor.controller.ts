import { Request, Response, NextFunction } from 'express';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError } from '../utils/response.js';

// Generate 2FA secret and QR code
export async function setup2FA(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });

    if (!user) {
      sendError(res, 'User not found', 'المستخدم غير موجود', 404);
      return;
    }

    if (user.twoFactorEnabled) {
      sendError(res, '2FA is already enabled', 'المصادقة الثنائية مفعّلة بالفعل', 400);
      return;
    }

    const secret = speakeasy.generateSecret({
      name: `رادار المستثمر (${user.email})`,
      issuer: 'Investor Radar',
      length: 20,
    });

    // Store secret temporarily (not enabled yet until verified)
    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorSecret: secret.base32 },
    });

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    sendSuccess(res, {
      secret: secret.base32,
      qrCode: qrCodeUrl,
    });
  } catch (error) {
    next(error);
  }
}

// Verify and enable 2FA
export async function verify2FA(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      sendError(res, 'Token is required', 'الرمز مطلوب', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorSecret) {
      sendError(res, 'Setup 2FA first', 'قم بإعداد المصادقة الثنائية أولاً', 400);
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      sendError(res, 'Invalid verification code', 'رمز التحقق غير صحيح', 400);
      return;
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex')
    );

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        twoFactorBackup: JSON.stringify(backupCodes),
      },
    });

    sendSuccess(res, {
      enabled: true,
      backupCodes,
      message: '2FA enabled successfully',
      messageAr: 'تم تفعيل المصادقة الثنائية بنجاح',
    });
  } catch (error) {
    next(error);
  }
}

// Disable 2FA
export async function disable2FA(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user!.userId;
    const { token } = req.body;

    if (!token) {
      sendError(res, 'Token is required', 'الرمز مطلوب', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { twoFactorSecret: true, twoFactorEnabled: true },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      sendError(res, '2FA is not enabled', 'المصادقة الثنائية غير مفعّلة', 400);
      return;
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token,
      window: 2,
    });

    if (!verified) {
      sendError(res, 'Invalid code', 'رمز التحقق غير صحيح', 400);
      return;
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackup: null,
      },
    });

    sendSuccess(res, {
      enabled: false,
      message: '2FA disabled',
      messageAr: 'تم تعطيل المصادقة الثنائية',
    });
  } catch (error) {
    next(error);
  }
}

// Validate 2FA token during login
export async function validate2FA(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { userId, token, backupCode } = req.body;

    if (!userId) {
      sendError(res, 'User ID required', 'معرف المستخدم مطلوب', 400);
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, twoFactorSecret: true, twoFactorBackup: true,
        twoFactorEnabled: true, role: true, name: true, nameAr: true, avatar: true, emailVerified: true,
      },
    });

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      sendError(res, 'Invalid request', 'طلب غير صالح', 400);
      return;
    }

    let valid = false;

    // Try TOTP token first
    if (token) {
      valid = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token,
        window: 2,
      });
    }

    // Try backup code
    if (!valid && backupCode) {
      const codes: string[] = JSON.parse(user.twoFactorBackup || '[]');
      const idx = codes.indexOf(backupCode);
      if (idx !== -1) {
        valid = true;
        codes.splice(idx, 1);
        await prisma.user.update({
          where: { id: userId },
          data: { twoFactorBackup: JSON.stringify(codes) },
        });
      }
    }

    if (!valid) {
      sendError(res, 'Invalid 2FA code', 'رمز المصادقة الثنائية غير صحيح', 401);
      return;
    }

    // Import generateToken from auth controller dynamically
    const jwt = await import('jsonwebtoken');
    const { config } = await import('../config/index.js');
    const jwtToken = jwt.default.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as any
    );

    sendSuccess(res, {
      user: {
        id: user.id, email: user.email, name: user.name, nameAr: user.nameAr,
        avatar: user.avatar, role: user.role, emailVerified: user.emailVerified,
      },
      token: jwtToken,
    });
  } catch (error) {
    next(error);
  }
}

// Get 2FA status
export async function get2FAStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { twoFactorEnabled: true },
    });

    sendSuccess(res, { enabled: user?.twoFactorEnabled ?? false });
  } catch (error) {
    next(error);
  }
}
