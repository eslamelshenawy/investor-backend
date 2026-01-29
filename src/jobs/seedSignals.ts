/**
 * Seed Signals - إضافة إشارات أولية
 * Run: npx tsx src/jobs/seedSignals.ts
 */

import { prisma, connectDatabase } from '../services/database.js';
import { logger } from '../utils/logger.js';

const mockSignals = [
  {
    type: 'OPPORTUNITY',
    title: 'Growing Real Estate Investment Opportunity in Riyadh',
    titleAr: 'فرصة استثمارية متنامية في العقارات بالرياض',
    summary: 'Real estate permits in Riyadh increased by 15% in Q4 2024, indicating strong market growth and investment opportunities in residential and commercial sectors.',
    summaryAr: 'ارتفعت تصاريح البناء في الرياض بنسبة 15% في الربع الرابع من 2024، مما يشير إلى نمو قوي في السوق وفرص استثمارية في القطاعين السكني والتجاري.',
    impactScore: 78,
    confidence: 85,
    trend: 'UP',
    region: 'Riyadh',
    sector: 'Real Estate',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["building-permits", "real-estate-index"], "indicators": {"quarterlyGrowth": 15, "yearlyGrowth": 23, "avgPrice": 4500}}',
    isActive: true,
  },
  {
    type: 'TREND',
    title: 'Tourism Sector Shows Strong Recovery',
    titleAr: 'قطاع السياحة يظهر تعافياً قوياً',
    summary: 'Tourist arrivals exceeded pre-pandemic levels with 12M visitors in 2024, driven by entertainment events and cultural tourism initiatives.',
    summaryAr: 'تجاوز عدد الزوار مستويات ما قبل الجائحة مع 12 مليون زائر في 2024، مدفوعاً بفعاليات الترفيه ومبادرات السياحة الثقافية.',
    impactScore: 82,
    confidence: 90,
    trend: 'UP',
    region: 'National',
    sector: 'Tourism',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["tourism-stats", "hotel-occupancy"], "indicators": {"visitors": 12000000, "growthRate": 28, "hotelOccupancy": 72}}',
    isActive: true,
  },
  {
    type: 'RISK',
    title: 'Rising Inflation in Food Sector',
    titleAr: 'ارتفاع التضخم في قطاع الغذاء',
    summary: 'Food prices increased 4.2% YoY, potentially affecting consumer spending and retail sector performance in the coming quarters.',
    summaryAr: 'ارتفعت أسعار الغذاء 4.2% سنوياً، مما قد يؤثر على إنفاق المستهلكين وأداء قطاع التجزئة في الأرباع القادمة.',
    impactScore: 65,
    confidence: 88,
    trend: 'UP',
    region: 'National',
    sector: 'Consumer',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["cpi-index", "food-prices"], "indicators": {"inflationRate": 4.2, "monthlyChange": 0.3, "foodIndex": 108.5}}',
    isActive: true,
  },
  {
    type: 'ALERT',
    title: 'New Business Regulations Coming into Effect',
    titleAr: 'أنظمة تجارية جديدة تدخل حيز التنفيذ',
    summary: 'New SME support regulations will reduce licensing requirements by 30%, creating easier market entry for new businesses starting March 2025.',
    summaryAr: 'ستقلل الأنظمة الجديدة لدعم المنشآت الصغيرة والمتوسطة متطلبات الترخيص بنسبة 30%، مما يسهل دخول السوق للشركات الجديدة بدءاً من مارس 2025.',
    impactScore: 70,
    confidence: 95,
    trend: 'STABLE',
    region: 'National',
    sector: 'Business',
    dataSource: 'MANUAL',
    details: '{"relatedDatasets": ["business-licenses", "sme-data"], "indicators": {"reductionPercent": 30, "effectiveDate": "2025-03-01"}}',
    isActive: true,
  },
  {
    type: 'OPPORTUNITY',
    title: 'E-commerce Growth Accelerating in Eastern Province',
    titleAr: 'نمو متسارع للتجارة الإلكترونية في المنطقة الشرقية',
    summary: 'E-commerce transactions in Eastern Province grew 45% YoY, outpacing national average. Logistics infrastructure investments creating new opportunities.',
    summaryAr: 'نمت معاملات التجارة الإلكترونية في المنطقة الشرقية بنسبة 45% سنوياً، متفوقة على المعدل الوطني. استثمارات البنية التحتية اللوجستية تخلق فرصاً جديدة.',
    impactScore: 75,
    confidence: 82,
    trend: 'UP',
    region: 'Eastern',
    sector: 'E-commerce',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["ecommerce-stats", "logistics-data"], "indicators": {"growthRate": 45, "transactionVolume": 2500000000}}',
    isActive: true,
  },
  {
    type: 'TREND',
    title: 'Green Energy Investments Surge',
    titleAr: 'ارتفاع حاد في استثمارات الطاقة الخضراء',
    summary: 'Renewable energy projects attracted $15B in investments in 2024, with solar and wind capacity expected to triple by 2030.',
    summaryAr: 'جذبت مشاريع الطاقة المتجددة 15 مليار دولار استثمارات في 2024، مع توقع تضاعف قدرة الطاقة الشمسية وطاقة الرياح ثلاث مرات بحلول 2030.',
    impactScore: 88,
    confidence: 92,
    trend: 'UP',
    region: 'National',
    sector: 'Energy',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["energy-production", "renewable-projects"], "indicators": {"investment": 15000000000, "targetYear": 2030, "currentCapacity": 2.5}}',
    isActive: true,
  },
  {
    type: 'RISK',
    title: 'Construction Material Costs Rising',
    titleAr: 'ارتفاع تكاليف مواد البناء',
    summary: 'Steel and cement prices increased 12% in Q4, potentially impacting construction project costs and timelines across major developments.',
    summaryAr: 'ارتفعت أسعار الحديد والأسمنت بنسبة 12% في الربع الرابع، مما قد يؤثر على تكاليف مشاريع البناء وجداولها الزمنية في المشاريع الكبرى.',
    impactScore: 60,
    confidence: 87,
    trend: 'UP',
    region: 'National',
    sector: 'Construction',
    dataSource: 'AI_ANALYSIS',
    details: '{"relatedDatasets": ["construction-materials", "building-costs"], "indicators": {"steelIncrease": 14, "cementIncrease": 10, "avgIncrease": 12}}',
    isActive: true,
  },
  {
    type: 'OPPORTUNITY',
    title: 'Healthcare Sector Expansion in Jeddah',
    titleAr: 'توسع قطاع الرعاية الصحية في جدة',
    summary: 'Three new hospitals and 15 specialized clinics planned for Jeddah, creating investment opportunities in medical equipment and services.',
    summaryAr: 'تخطيط لإنشاء 3 مستشفيات جديدة و15 عيادة متخصصة في جدة، مما يخلق فرصاً استثمارية في المعدات والخدمات الطبية.',
    impactScore: 72,
    confidence: 80,
    trend: 'UP',
    region: 'Jeddah',
    sector: 'Healthcare',
    dataSource: 'MANUAL',
    details: '{"relatedDatasets": ["healthcare-facilities", "medical-investments"], "indicators": {"newHospitals": 3, "newClinics": 15, "investmentValue": 2000000000}}',
    isActive: true,
  },
];

async function seedSignals() {
  logger.info('🌱 Starting signal seeding...');

  try {
    await connectDatabase();

    // Check if signals already exist
    const existingCount = await prisma.signal.count();

    if (existingCount > 0) {
      logger.info(`Found ${existingCount} existing signals. Skipping seed.`);
      return;
    }

    // Insert signals
    for (const signal of mockSignals) {
      await prisma.signal.create({
        data: signal,
      });
      logger.info(`✅ Created signal: ${signal.titleAr}`);
    }

    logger.info(`\n🎉 Successfully seeded ${mockSignals.length} signals!`);

  } catch (error) {
    logger.error('❌ Error seeding signals:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run
seedSignals()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
