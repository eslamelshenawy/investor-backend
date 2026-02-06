import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // Server
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isDev: process.env.NODE_ENV !== 'production',

  // Database
  databaseUrl: process.env.DATABASE_URL || '',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'default-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  // Saudi Open Data
  saudiDataApi: process.env.SAUDI_DATA_API || 'https://open.data.gov.sa/data/api',

  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiProvider: process.env.AI_PROVIDER || 'openai',

  // CORS - يدعم عدة روابط مفصولة بفاصلة
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000')
    .split(',')
    .map(origin => origin.trim()),

  // Sync intervals (in milliseconds)
  sync: {
    fullSyncInterval: 6 * 60 * 60 * 1000,  // 6 hours
    quickCheckInterval: 60 * 60 * 1000,     // 1 hour
    aiAnalysisInterval: 6 * 60 * 60 * 1000, // 6 hours
    contentGenInterval: 24 * 60 * 60 * 1000, // 24 hours
    cacheRefreshInterval: 30 * 60 * 1000,   // 30 minutes
  },

  // SMTP
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },

  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  // Moyasar Payment Gateway
  moyasar: {
    publishableKey: process.env.MOYASAR_PUBLISHABLE_KEY || '',
    secretKey: process.env.MOYASAR_SECRET_KEY || '',
  },

  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
  },
} as const;

export default config;
