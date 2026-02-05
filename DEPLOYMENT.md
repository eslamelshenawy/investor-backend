# دليل نشر Backend - رادار المستثمر

> للدليل الكامل راجع: `E:\investor\DEPLOYMENT.md`

## معلومات السيرفر

| البند | القيمة |
|-------|--------|
| **السيرفر** | Plesk (cp.al-investor.com) - Ubuntu 20.04 |
| **IP** | 194.233.170.186 |
| **SSH Alias** | `investor` |
| **المسار** | `/var/www/vhosts/al-investor.com/radar-sa.al-investor.com/backend` |
| **PM2 Process** | `radar-sa-api` |
| **URL** | `https://radar-sa.al-investor.com/api` |
| **Health** | `https://radar-sa.al-investor.com/api/health` |

## Environment Variables

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.udtuzktclvvjaqffvnfp:NiYqO4slVgX9k26s@aws-1-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Auth
JWT_SECRET=investor-radar-jwt-secret-2024-secure-key

# Server
NODE_ENV=production
PORT=3001

# CORS
CORS_ORIGINS=https://radar-sa.al-investor.com
FRONTEND_URL=https://radar-sa.al-investor.com

# Redis (Upstash - TLS)
REDIS_URL=rediss://default:Aar1AAIncDIzYTA3Y2ZmNDVjYjE0MWExODMzYTcyYWI0NGQzNDdiY3AyNDM3NjU@flowing-camel-43765.upstash.io:6379

# AI
AI_PROVIDER=openai
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_MODEL=gpt-4o-mini
```

## أوامر Deploy

```bash
# الاتصال بالسيرفر
ssh investor

# تفعيل Node.js
export NODENV_VERSION=20

# الانتقال لمسار الباكإند
cd /var/www/vhosts/al-investor.com/radar-sa.al-investor.com/backend

# سحب آخر التحديثات
git pull

# تثبيت الحزم
npm install

# بناء المشروع
npm run build

# إعادة تشغيل PM2
/var/www/vhosts/al-investor.com/local/bin/pm2 restart radar-sa-api

# عرض اللوجات
/var/www/vhosts/al-investor.com/local/bin/pm2 logs radar-sa-api
```

## Cron Jobs

| Job | التوقيت | الوظيفة |
|-----|---------|---------|
| AI Analysis | كل 6 ساعات | توليد إشارات ذكية |
| Content Gen | يومياً 6 صباحاً | توليد محتوى بالـ AI |
| Quick Check | كل ساعة | تنظيف Signals المنتهية |
| Cache Refresh | كل 30 دقيقة | تحديث الـ Cache |

## حساب المدير

| البيان | القيمة |
|--------|--------|
| **البريد** | `admin@investor-radar.com` |
| **كلمة المرور** | `Admin@123456` |
| **رابط الدخول** | `https://radar-sa.al-investor.com/#/login` |

---

*آخر تحديث: 5 فبراير 2026*
