import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import routes from './routes/index.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';

export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());

  // CORS - يدعم عدة روابط للـ Frontend
  app.use(
    cors({
      origin: (origin, callback) => {
        // السماح للطلبات بدون origin (مثل mobile apps أو Postman)
        if (!origin) return callback(null, true);

        // التحقق من القائمة المسموحة
        if (config.corsOrigins.includes(origin) || config.corsOrigins.includes('*')) {
          return callback(null, true);
        }

        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      message: {
        success: false,
        error: 'Too many requests, please try again later.',
        errorAr: 'طلبات كثيرة جداً، يرجى المحاولة لاحقاً.',
      },
    })
  );

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logging
  app.use((req, _res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // API routes
  app.use('/api', routes);

  // Root endpoint
  app.get('/', (_req, res) => {
    res.json({
      name: 'Investor Radar API',
      nameAr: 'واجهة برمجة رادار المستثمر',
      version: '1.0.0',
      status: 'running',
      docs: '/api/health',
    });
  });

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
