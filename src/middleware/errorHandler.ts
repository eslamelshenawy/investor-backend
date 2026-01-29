import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export class AppError extends Error {
  statusCode: number;
  messageAr: string;
  isOperational: boolean;

  constructor(
    message: string,
    messageAr: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.messageAr = messageAr;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    success: false,
    error: `Route ${req.originalUrl} not found`,
    errorAr: `المسار ${req.originalUrl} غير موجود`,
  });
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logger.error('Error:', err);

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    res.status(400).json({
      success: false,
      error: 'Validation error',
      errorAr: 'خطأ في التحقق من البيانات',
      details: errors,
    });
    return;
  }

  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      errorAr: err.messageAr,
      ...(config.isDev && { stack: err.stack }),
    });
    return;
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    const prismaError = err as unknown as { code: string; meta?: { target?: string[] } };

    if (prismaError.code === 'P2002') {
      const target = prismaError.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        error: `Duplicate value for ${target}`,
        errorAr: `قيمة مكررة للحقل ${target}`,
      });
      return;
    }

    if (prismaError.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Record not found',
        errorAr: 'السجل غير موجود',
      });
      return;
    }
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: config.isDev ? err.message : 'Internal server error',
    errorAr: config.isDev ? err.message : 'خطأ داخلي في الخادم',
    ...(config.isDev && { stack: err.stack }),
  });
}

export default { AppError, notFoundHandler, errorHandler };
