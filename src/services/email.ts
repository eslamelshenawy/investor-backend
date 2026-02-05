/**
 * Email Service - خدمة البريد الإلكتروني
 * Currently logs emails to console. Replace with SMTP/SendGrid/SES for production.
 */

import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email (currently logs to console in dev, can be extended with SMTP)
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    // TODO: Replace with actual email service (SendGrid, SES, Nodemailer, etc.)
    logger.info(`📧 Email to: ${options.to}`);
    logger.info(`   Subject: ${options.subject}`);
    logger.debug(`   Body: ${options.html.substring(0, 200)}...`);

    // In production, this would send via SMTP
    // For now, log the email content so it can be tested
    return true;
  } catch (error) {
    logger.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(
  to: string,
  resetToken: string,
  userName: string
): Promise<boolean> {
  const resetUrl = `${config.frontendUrl}/#/reset-password?token=${resetToken}`;

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2563eb; font-size: 24px;">رادار المستثمر</h1>
        <p style="color: #64748b; font-size: 12px;">Investor Radar</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 30px; border: 1px solid #e2e8f0;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">استعادة كلمة المرور</h2>
        <p style="color: #475569; line-height: 1.8;">مرحباً ${userName}،</p>
        <p style="color: #475569; line-height: 1.8;">لقد طلبت استعادة كلمة المرور الخاصة بحسابك. اضغط على الرابط أدناه لإعادة تعيين كلمة المرور:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            إعادة تعيين كلمة المرور
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 13px;">أو انسخ هذا الرابط في المتصفح:</p>
        <p style="color: #2563eb; font-size: 13px; word-break: break-all;">${resetUrl}</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

        <p style="color: #94a3b8; font-size: 12px;">⚠️ هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
        <p style="color: #94a3b8; font-size: 12px;">إذا لم تطلب استعادة كلمة المرور، يمكنك تجاهل هذا البريد.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: 'استعادة كلمة المرور - رادار المستثمر',
    html,
  });
}

/**
 * Send email verification email
 */
export async function sendVerificationEmail(
  to: string,
  verifyToken: string,
  userName: string
): Promise<boolean> {
  const verifyUrl = `${config.frontendUrl}/#/verify-email?token=${verifyToken}`;

  const html = `
    <div dir="rtl" style="font-family: 'Segoe UI', Tahoma, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #2563eb; font-size: 24px;">رادار المستثمر</h1>
        <p style="color: #64748b; font-size: 12px;">Investor Radar</p>
      </div>

      <div style="background: #f8fafc; border-radius: 12px; padding: 30px; border: 1px solid #e2e8f0;">
        <h2 style="color: #1e293b; margin-bottom: 16px;">تأكيد البريد الإلكتروني</h2>
        <p style="color: #475569; line-height: 1.8;">مرحباً ${userName}،</p>
        <p style="color: #475569; line-height: 1.8;">شكراً لتسجيلك في رادار المستثمر. يرجى تأكيد بريدك الإلكتروني بالضغط على الرابط أدناه:</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${verifyUrl}" style="background: #16a34a; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">
            تأكيد البريد الإلكتروني
          </a>
        </div>

        <p style="color: #94a3b8; font-size: 13px;">أو انسخ هذا الرابط في المتصفح:</p>
        <p style="color: #2563eb; font-size: 13px; word-break: break-all;">${verifyUrl}</p>

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">

        <p style="color: #94a3b8; font-size: 12px;">⚠️ هذا الرابط صالح لمدة 24 ساعة.</p>
        <p style="color: #94a3b8; font-size: 12px;">إذا لم تقم بالتسجيل في رادار المستثمر، يمكنك تجاهل هذا البريد.</p>
      </div>
    </div>
  `;

  return sendEmail({
    to,
    subject: 'تأكيد البريد الإلكتروني - رادار المستثمر',
    html,
  });
}

export default { sendEmail, sendPasswordResetEmail, sendVerificationEmail };
