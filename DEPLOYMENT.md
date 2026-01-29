# 🚀 دليل نشر مشروع رادار المستثمر

## نظرة عامة على البنية

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     Vercel      │     │     Render      │     │    Supabase     │
│   (Frontend)    │────▶│   (Backend)     │────▶│   (PostgreSQL)  │
│   React + Vite  │     │  Express.js     │     │    Database     │
│     مجاني       │     │     مجاني       │     │      مجاني      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
│    Upstash      │   │  Browserless    │   │  UptimeRobot    │
│    (Redis)      │   │ (Cloud Chrome)  │   │   (24/7 Up)     │
│     مجاني       │   │     مجاني       │   │     مجاني       │
└─────────────────┘   └─────────────────┘   └─────────────────┘
```

---

## 📋 المتطلبات

- حساب [Vercel](https://vercel.com) (مجاني)
- حساب [Render](https://render.com) (مجاني)
- حساب [Supabase](https://supabase.com) (مجاني)
- حساب [Upstash](https://upstash.com) (مجاني)
- حساب [UptimeRobot](https://uptimerobot.com) (مجاني)
- حساب [Browserless.io](https://browserless.io) (مجاني - 1000 وحدة/شهر)
- حساب [GitHub](https://github.com) لربط المشاريع

---

## 1️⃣ إعداد قاعدة البيانات (Supabase) ✅ تم

### بيانات المشروع

| البند | القيمة |
|-------|--------|
| **Project Name** | `investor-radar` |
| **Project URL** | `https://udtuzktclvvjaqffvnfp.supabase.co` |
| **Region** | `eu-west-1` (Ireland) |
| **Database Password** | `NiYqO4slVgX9k26s` |

### Connection String (Transaction Pooler)

```
postgresql://postgres.udtuzktclvvjaqffvnfp:NiYqO4slVgX9k26s@aws-1-eu-west-1.pooler.supabase.com:6543/postgres
```

> ✅ IPv4 Compatible - يعمل مع Render

### الجداول ✅ تم إنشاؤها

- `users` - المستخدمين
- `dashboards` - لوحات البيانات
- `favorites` - المفضلات
- `signals` - الإشارات الذكية
- `content` - المحتوى
- `datasets` - مجموعات البيانات
- `data_records` - سجلات البيانات
- `sync_logs` - سجل المزامنة
- `notifications` - الإشعارات
- `settings` - الإعدادات

---

## 2️⃣ رفع الكود على GitHub ✅ تم

### روابط المشاريع

| المشروع | الرابط |
|---------|--------|
| **Backend** | https://github.com/eslamelshenawy/investor-backend |
| **Frontend** | https://github.com/eslamelshenawy/investor-frontend |

---

## 3️⃣ نشر Backend على Render ✅ تم

### بيانات الخدمة

| البند | القيمة |
|-------|--------|
| **Service Name** | `investor-backend` |
| **Service ID** | `srv-d5tta9ali9vc73anq2vg` |
| **URL** | `https://investor-backend-3p3m.onrender.com` |
| **API Health** | `https://investor-backend-3p3m.onrender.com/api/health` |
| **Status** | ✅ Live |

### Environment Variables المستخدمة

| Variable | Value |
|----------|-------|
| `DATABASE_URL` | `postgresql://postgres.udtuzktclvvjaqffvnfp:NiYqO4slVgX9k26s@aws-1-eu-west-1.pooler.supabase.com:6543/postgres` |
| `JWT_SECRET` | `investor-radar-jwt-secret-2024-secure-key` |
| `NODE_ENV` | `production` |
| `PORT` | `10000` |
| `CORS_ORIGINS` | `https://investor-frontend-sable.vercel.app` |
| `OPENAI_API_KEY` | `sk-your-openai-api-key` |
| `AI_PROVIDER` | `openai` |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `REDIS_URL` | `redis://default:Aar1AAIncDIzYTA3Y2ZmNDVjYjE0MWExODMzYTcyYWI0NGQzNDdiY3AyNDM3NjU@flowing-camel-43765.upstash.io:6379` |
| `BROWSERLESS_TOKEN` | `2Tsqiks5VuJlWHV71d25294045c61d5e00ff2a5c0b0425971` |

---

## 4️⃣ نشر Frontend على Vercel ✅ تم

### بيانات المشروع

| البند | القيمة |
|-------|--------|
| **Project Name** | `investor-frontend` |
| **URL** | `https://investor-frontend-sable.vercel.app` |
| **Framework** | `Vite` |
| **Status** | ✅ Live |

### Environment Variables

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://investor-backend-3p3m.onrender.com/api` |

---

## 5️⃣ إعداد Redis Cache (Upstash) ✅ تم

### بيانات Redis

| البند | القيمة |
|-------|--------|
| **Provider** | Upstash |
| **Name** | `investor-radar-cache` |
| **Region** | `eu-central-1` (Frankfurt) |
| **Endpoint** | `flowing-camel-43765.upstash.io` |
| **Port** | `6379` |
| **TLS** | Enabled |

### Redis URL

```
redis://default:Aar1AAIncDIzYTA3Y2ZmNDVjYjE0MWExODMzYTcyYWI0NGQzNDdiY3AyNDM3NjU@flowing-camel-43765.upstash.io:6379
```

---

## 6️⃣ إعداد UptimeRobot (24/7 Monitoring) ✅ تم

### بيانات المراقبة

| البند | القيمة |
|-------|--------|
| **Provider** | UptimeRobot |
| **Monitor Type** | HTTP(s) |
| **URL** | `https://investor-backend-3p3m.onrender.com/api/health` |
| **Interval** | 5 minutes |
| **Status** | ✅ UP |
| **Alert Email** | `eslamelshenawy9316@gmail.com` |

### الفائدة

- ✅ يبقي السيرفر نشط 24/7
- ✅ يمنع النوم (Sleep) في Render Free Tier
- ✅ Cron Jobs تعمل بشكل مستمر
- ✅ إشعارات عند توقف الخدمة

---

## 👤 حساب المدير

### بيانات الدخول

| البيان | القيمة |
|--------|--------|
| **البريد الإلكتروني** | `admin@investor-radar.com` |
| **كلمة المرور** | `Admin@123456` |
| **الصلاحية** | `ADMIN` |

### رابط تسجيل الدخول

```
https://investor-frontend-sable.vercel.app/#/login
```

---

## 📊 ملخص الروابط النهائية

| الخدمة | الرابط | الحالة |
|--------|--------|--------|
| **Frontend** | https://investor-frontend-sable.vercel.app | ✅ UP |
| **Backend API** | https://investor-backend-3p3m.onrender.com | ✅ UP |
| **API Health** | https://investor-backend-3p3m.onrender.com/api/health | ✅ UP |
| **Supabase** | https://supabase.com/dashboard/project/udtuzktclvvjaqffvnfp | ✅ جاهز |
| **Upstash** | https://console.upstash.com | ✅ جاهز |
| **UptimeRobot** | https://uptimerobot.com/dashboard | ✅ مراقب |

---

## 🔄 Cron Jobs (المهام التلقائية)

| Job | التوقيت | الوظيفة | الحالة |
|-----|---------|---------|--------|
| Full Sync | كل 6 ساعات | مزامنة البيانات الحكومية | ✅ نشط |
| AI Analysis | كل 6 ساعات | توليد إشارات ذكية | ✅ نشط |
| Content Gen | يومياً الساعة 6 صباحاً | توليد محتوى بالـ AI | ✅ نشط |
| Cache Refresh | كل 30 دقيقة | تحديث الـ Cache | ✅ نشط |
| **Discovery** | **أسبوعياً (الأحد 3 صباحاً)** | **اكتشاف Datasets جديدة** | ✅ نشط |

---

## 7️⃣ إعداد Browserless.io (Cloud Chrome) ✅ تم

### ما هي؟
خدمة توفر **Chrome في السحابة** - بدلاً من تثبيت Chromium على السيرفر (170MB+)، نتصل بـ Chrome عن بُعد.

### بيانات الحساب

| البند | القيمة |
|-------|--------|
| **Provider** | Browserless.io |
| **Plan** | Free (1000 units/month) |
| **API Token** | `2Tsqiks5VuJlWHV71d25294045c61d5e00ff2a5c0b0425971` |
| **Dashboard** | https://cloud.browserless.io |

### الفائدة

- ✅ Deploy سريع (لا حاجة لتحميل Chromium)
- ✅ Discovery يعمل على السيرفر
- ✅ 1000 وحدة مجانية/شهر
- ✅ يدعم puppeteer-core

---

## 🔍 خدمة الاكتشاف (Discovery API)

### ما هي؟
خدمة تستخدم **puppeteer-core + Browserless.io** لفتح موقع البيانات المفتوحة السعودية واكتشاف Datasets جديدة تلقائياً.

### عدد الـ Datasets
| البند | العدد |
|-------|-------|
| **Datasets الحالية** | **54** |
| عقارات | 22 |
| تمويل | 11 |
| قانونية | 3 |
| إحصائيات | 4 |
| استثمار | 2 |
| أخرى (مكتشفة) | 12 |

### API Endpoints

| Method | Endpoint | الوظيفة |
|--------|----------|---------|
| GET | `/api/discovery/stats` | إحصائيات الاكتشاف |
| GET | `/api/discovery/discover` | اكتشاف Datasets جديدة |
| POST | `/api/discovery/add` | إضافة Datasets يدوياً |
| POST | `/api/discovery/sync-all` | مزامنة كل الـ Datasets |
| POST | `/api/discovery/sync/:id` | مزامنة dataset واحد |
| POST | `/api/discovery/discover-and-sync` | اكتشاف + إضافة + مزامنة |

### تشغيل يدوي (CLI)

```bash
# اكتشاف فقط
npm run discover

# اكتشاف وإضافة
npm run discover -- add

# مزامنة
npm run discover -- sync

# العملية الكاملة
npm run discover -- full

# إحصائيات
npm run discover -- stats
```

---

## 🔧 Environment Variables الكاملة

### Backend (Render) ✅

```env
# Database (Supabase)
DATABASE_URL=postgresql://postgres.udtuzktclvvjaqffvnfp:NiYqO4slVgX9k26s@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

# Auth
JWT_SECRET=investor-radar-jwt-secret-2024-secure-key

# Server
NODE_ENV=production
PORT=10000

# CORS
CORS_ORIGINS=https://investor-frontend-sable.vercel.app

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key
AI_PROVIDER=openai
OPENAI_MODEL=gpt-4o-mini

# Redis (Upstash)
REDIS_URL=redis://default:Aar1AAIncDIzYTA3Y2ZmNDVjYjE0MWExODMzYTcyYWI0NGQzNDdiY3AyNDM3NjU@flowing-camel-43765.upstash.io:6379

# Browserless.io (Cloud Chrome for Discovery)
BROWSERLESS_TOKEN=2Tsqiks5VuJlWHV71d25294045c61d5e00ff2a5c0b0425971
```

### Frontend (Vercel) ✅

```env
VITE_API_URL=https://investor-backend-3p3m.onrender.com/api
```

---

## ⚠️ ملاحظات مهمة

### Render Free Tier

| الميزة | التفاصيل |
|--------|----------|
| ✅ الساعات | 750 ساعة مجانية/شهر |
| ✅ النوم | **محلول** بـ UptimeRobot |
| ✅ Cron Jobs | تعمل 24/7 |

### Supabase Free Tier

| الميزة | التفاصيل |
|--------|----------|
| ✅ قاعدة البيانات | 500MB |
| ✅ Bandwidth | 2GB |
| ⚠️ التوقف | يتوقف بعد 7 أيام من عدم الاستخدام |

### Vercel Free Tier

| الميزة | التفاصيل |
|--------|----------|
| ✅ Deployments | غير محدود |
| ✅ Bandwidth | 100GB |
| ✅ النوم | لا ينام! |

### Upstash Free Tier

| الميزة | التفاصيل |
|--------|----------|
| ✅ Commands | 10,000/يوم |
| ✅ Storage | 256MB |
| ✅ Bandwidth | 50GB/شهر |

### Browserless.io Free Tier

| الميزة | التفاصيل |
|--------|----------|
| ✅ Units | 1,000/شهر |
| ✅ Concurrency | 1 |
| ✅ Discovery | يكفي للاكتشاف الأسبوعي |

---

## 🐛 حل المشاكل الشائعة

### مشكلة: CORS Error

تأكد من تحديث `CORS_ORIGINS` في Render برابط Vercel الصحيح.

### مشكلة: Database connection failed

1. تأكد من صحة `DATABASE_URL`
2. تأكد أن المشروع نشط في Supabase
3. استخدم Transaction Pooler وليس Direct Connection

### مشكلة: السيرفر ينام

تأكد من إعداد UptimeRobot لمراقبة `/api/health` كل 5 دقائق.

---

## 📞 روابط مفيدة

- [Vercel Docs](https://vercel.com/docs)
- [Render Docs](https://render.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Upstash Docs](https://upstash.com/docs)
- [UptimeRobot Docs](https://uptimerobot.com/docs)

---

## ✅ ملخص الإنجاز - المشروع مكتمل 100%

| الخطوة | الحالة |
|--------|--------|
| إعداد Supabase | ✅ تم |
| إنشاء الجداول | ✅ تم |
| رفع الكود على GitHub | ✅ تم |
| نشر Backend على Render | ✅ تم |
| نشر Frontend على Vercel | ✅ تم |
| تحديث CORS | ✅ تم |
| إنشاء حساب المدير | ✅ تم |
| إعداد OpenAI | ✅ تم |
| إعداد Redis (Upstash) | ✅ تم |
| إعداد UptimeRobot | ✅ تم |
| Cron Jobs نشطة | ✅ تم |
| **54 Dataset** | ✅ تم |
| **Browserless.io (Cloud Chrome)** | ✅ تم |
| **Discovery API (puppeteer-core)** | ✅ تم |

---

## 🎉 المشروع جاهز للإنتاج!

```
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚀 رادار المستثمر - Investor Radar                    ║
║                                                           ║
║   Frontend:  https://investor-frontend-sable.vercel.app  ║
║   Backend:   https://investor-backend-3p3m.onrender.com  ║
║                                                           ║
║   Status: ✅ LIVE & RUNNING 24/7                         ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

---

*آخر تحديث: 30 يناير 2026*
