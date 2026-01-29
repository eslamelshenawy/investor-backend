/**
 * Seed Content - بذر المحتوى الأولي
 * Creates initial content for testing
 */

import { prisma } from '../services/database.js';
import { logger } from '../utils/logger.js';

const INITIAL_CONTENT = [
  {
    type: 'ARTICLE',
    title: 'Saudi Vision 2030: Economic Transformation Progress Report',
    titleAr: 'رؤية السعودية 2030: تقرير التحول الاقتصادي',
    body: `Saudi Arabia's Vision 2030 continues to reshape the Kingdom's economic landscape. The ambitious reform program has achieved significant milestones in diversifying the economy away from oil dependency.

Key achievements include the development of mega-projects like NEOM, the Red Sea Project, and Qiddiya. The entertainment sector has emerged as a new economic pillar, contributing billions to GDP.

The privatization program has accelerated, with major state assets being listed on Tadawul. Foreign direct investment has increased substantially, attracted by regulatory reforms and improved business environment.

The non-oil sector now contributes over 50% to GDP, marking a historic shift in the Saudi economy's structure.`,
    bodyAr: `تواصل رؤية السعودية 2030 إعادة تشكيل المشهد الاقتصادي للمملكة. حقق برنامج الإصلاح الطموح إنجازات كبيرة في تنويع الاقتصاد بعيداً عن الاعتماد على النفط.

تشمل الإنجازات الرئيسية تطوير المشاريع العملاقة مثل نيوم ومشروع البحر الأحمر والقدية. برز قطاع الترفيه كركيزة اقتصادية جديدة، مساهماً بمليارات الريالات في الناتج المحلي.

تسارع برنامج الخصخصة مع إدراج أصول حكومية كبرى في تداول. زاد الاستثمار الأجنبي المباشر بشكل كبير، منجذباً بالإصلاحات التنظيمية وتحسن بيئة الأعمال.

يساهم القطاع غير النفطي الآن بأكثر من 50% في الناتج المحلي، مسجلاً تحولاً تاريخياً في هيكل الاقتصاد السعودي.`,
    excerpt: 'A comprehensive look at Saudi Vision 2030 achievements and economic transformation progress.',
    excerptAr: 'نظرة شاملة على إنجازات رؤية 2030 وتقدم التحول الاقتصادي.',
    tags: ['vision-2030', 'economy', 'transformation', 'investment'],
  },
  {
    type: 'REPORT',
    title: 'Q4 2024 Real Estate Market Analysis',
    titleAr: 'تحليل سوق العقارات للربع الرابع 2024',
    body: `The Saudi real estate market showed strong performance in Q4 2024, with transaction volumes reaching record highs in major cities.

Riyadh led the growth with a 23% increase in residential transactions compared to the previous quarter. The average price per square meter in prime locations rose by 8%, reflecting strong demand from both local and international buyers.

Commercial real estate also performed well, with office occupancy rates in Riyadh exceeding 85%. The retail sector benefited from increased consumer spending during the holiday season.

Looking ahead, the market is expected to maintain momentum, supported by population growth, Vision 2030 projects, and favorable financing conditions.`,
    bodyAr: `أظهر سوق العقارات السعودي أداءً قوياً في الربع الرابع من 2024، حيث وصلت أحجام المعاملات إلى مستويات قياسية في المدن الرئيسية.

قادت الرياض النمو بزيادة 23% في المعاملات السكنية مقارنة بالربع السابق. ارتفع متوسط السعر للمتر المربع في المواقع الرئيسية بنسبة 8%، مما يعكس الطلب القوي من المشترين المحليين والدوليين.

كما أدى العقار التجاري أداءً جيداً، حيث تجاوزت معدلات إشغال المكاتب في الرياض 85%. استفاد قطاع التجزئة من زيادة إنفاق المستهلكين خلال موسم الأعياد.

وبالنظر إلى المستقبل، من المتوقع أن يحافظ السوق على زخمه، مدعوماً بالنمو السكاني ومشاريع رؤية 2030 وظروف التمويل المواتية.`,
    excerpt: 'Real estate transactions hit record highs in Q4 2024 with Riyadh leading growth.',
    excerptAr: 'معاملات العقارات تسجل مستويات قياسية في الربع الرابع 2024 مع قيادة الرياض للنمو.',
    tags: ['real-estate', 'market-analysis', 'riyadh', 'q4-2024'],
  },
  {
    type: 'NEWS',
    title: 'New SME Support Program Launched',
    titleAr: 'إطلاق برنامج دعم جديد للمنشآت الصغيرة والمتوسطة',
    body: `The Ministry of Commerce announced a new comprehensive support program for small and medium enterprises (SMEs), aiming to reduce bureaucratic barriers and improve access to financing.

The program includes streamlined licensing procedures, reduced fees, and dedicated support centers across all regions. Digital services will allow entrepreneurs to complete most procedures online within 24 hours.

A new financing initiative in partnership with local banks will provide loans at competitive rates, with special terms for women-owned and youth-led businesses.

The program targets creating 100,000 new jobs in the SME sector by 2026.`,
    bodyAr: `أعلنت وزارة التجارة عن برنامج دعم شامل جديد للمنشآت الصغيرة والمتوسطة، يهدف إلى تقليل العوائق البيروقراطية وتحسين الوصول إلى التمويل.

يشمل البرنامج إجراءات ترخيص مبسطة ورسوم مخفضة ومراكز دعم مخصصة في جميع المناطق. ستتيح الخدمات الرقمية لرواد الأعمال إتمام معظم الإجراءات إلكترونياً خلال 24 ساعة.

ستوفر مبادرة تمويل جديدة بالشراكة مع البنوك المحلية قروضاً بأسعار تنافسية، مع شروط خاصة للمنشآت المملوكة للنساء والشباب.

يستهدف البرنامج خلق 100,000 وظيفة جديدة في قطاع المنشآت الصغيرة والمتوسطة بحلول 2026.`,
    excerpt: 'Ministry of Commerce launches comprehensive SME support program with streamlined procedures.',
    excerptAr: 'وزارة التجارة تطلق برنامج دعم شامل للمنشآت الصغيرة والمتوسطة.',
    tags: ['sme', 'business', 'entrepreneurship', 'financing'],
  },
  {
    type: 'INSIGHT',
    title: 'Tourism Sector: Key Investment Opportunities',
    titleAr: 'قطاع السياحة: فرص الاستثمار الرئيسية',
    body: `Saudi Arabia's tourism sector presents compelling investment opportunities as the Kingdom targets 150 million annual visits by 2030.

Key areas for investment include:

1. Hospitality: Over 500,000 new hotel rooms needed, with opportunities in luxury resorts, boutique hotels, and budget accommodations.

2. Entertainment: Theme parks, cultural attractions, and adventure tourism facilities are in high demand.

3. Religious Tourism: Infrastructure for Hajj and Umrah visitors continues to expand, with opportunities in hospitality, transportation, and services.

4. Eco-Tourism: The Red Sea Project and NEOM create unique opportunities for sustainable tourism investments.

5. Technology: Tourism tech startups addressing booking, experiences, and guest services are attracting significant funding.`,
    bodyAr: `يقدم قطاع السياحة السعودي فرصاً استثمارية جذابة حيث تستهدف المملكة 150 مليون زيارة سنوية بحلول 2030.

المجالات الرئيسية للاستثمار تشمل:

1. الضيافة: الحاجة لأكثر من 500,000 غرفة فندقية جديدة، مع فرص في المنتجعات الفاخرة والفنادق البوتيكية والإقامات الاقتصادية.

2. الترفيه: الطلب مرتفع على المنتزهات الترفيهية والمعالم الثقافية ومرافق سياحة المغامرات.

3. السياحة الدينية: استمرار توسع البنية التحتية لزوار الحج والعمرة، مع فرص في الضيافة والنقل والخدمات.

4. السياحة البيئية: يخلق مشروع البحر الأحمر ونيوم فرصاً فريدة للاستثمار في السياحة المستدامة.

5. التقنية: الشركات الناشئة في تقنية السياحة تجذب تمويلاً كبيراً.`,
    excerpt: 'Exploring key investment opportunities in Saudi tourism sector targeting 150M annual visits.',
    excerptAr: 'استكشاف فرص الاستثمار الرئيسية في قطاع السياحة السعودي.',
    tags: ['tourism', 'investment', 'hospitality', 'opportunities'],
  },
  {
    type: 'ANALYSIS',
    title: 'Digital Economy: E-commerce Growth Trends',
    titleAr: 'الاقتصاد الرقمي: اتجاهات نمو التجارة الإلكترونية',
    body: `Saudi Arabia's e-commerce market has grown exponentially, reaching SAR 150 billion in 2024. The sector is projected to continue its upward trajectory.

Key growth drivers include:
- High smartphone penetration (98%)
- Young, tech-savvy population
- Improved logistics infrastructure
- Growing digital payment adoption

The fashion and electronics categories lead in transaction volume, while grocery delivery has shown the fastest growth rate.

Local platforms have gained market share against international competitors by offering Arabic-language interfaces, local payment options, and faster delivery times.

Investment in fulfillment centers and last-mile delivery solutions remains critical for sustained growth.`,
    bodyAr: `نما سوق التجارة الإلكترونية السعودي بشكل كبير، ليصل إلى 150 مليار ريال في 2024. من المتوقع أن يواصل القطاع مساره التصاعدي.

محركات النمو الرئيسية تشمل:
- انتشار الهواتف الذكية المرتفع (98%)
- السكان الشباب المتمرسين تقنياً
- تحسن البنية التحتية اللوجستية
- تزايد اعتماد الدفع الرقمي

تقود فئات الأزياء والإلكترونيات حجم المعاملات، بينما أظهر توصيل البقالة أسرع معدل نمو.

اكتسبت المنصات المحلية حصة سوقية ضد المنافسين الدوليين من خلال تقديم واجهات باللغة العربية وخيارات دفع محلية وأوقات توصيل أسرع.

يظل الاستثمار في مراكز التوزيع وحلول التوصيل للميل الأخير أمراً حاسماً للنمو المستدام.`,
    excerpt: 'E-commerce market reaches SAR 150 billion with continued strong growth expected.',
    excerptAr: 'سوق التجارة الإلكترونية يصل إلى 150 مليار ريال مع توقعات بنمو قوي مستمر.',
    tags: ['ecommerce', 'digital-economy', 'technology', 'retail'],
  },
  {
    type: 'ARTICLE',
    title: 'Green Hydrogen: Saudi Arabia\'s Next Energy Frontier',
    titleAr: 'الهيدروجين الأخضر: حدود الطاقة القادمة للسعودية',
    body: `Saudi Arabia is positioning itself as a global leader in green hydrogen production, leveraging its abundant solar and wind resources.

The NEOM Green Hydrogen Project, a $8.4 billion investment, will produce 650 tons of green hydrogen daily when fully operational. This represents one of the world's largest green hydrogen facilities.

The Kingdom's competitive advantages include:
- Low-cost renewable energy production
- Strategic geographic location for exports
- Existing infrastructure and expertise in energy sector
- Strong government support and clear policy framework

Export agreements have been signed with major markets in Asia and Europe, with hydrogen expected to become a significant non-oil export by 2030.`,
    bodyAr: `تضع المملكة العربية السعودية نفسها كرائد عالمي في إنتاج الهيدروجين الأخضر، مستفيدة من مواردها الشمسية والرياح الوفيرة.

سينتج مشروع نيوم للهيدروجين الأخضر، باستثمار 8.4 مليار دولار، 650 طناً من الهيدروجين الأخضر يومياً عند التشغيل الكامل. يمثل هذا أحد أكبر منشآت الهيدروجين الأخضر في العالم.

المزايا التنافسية للمملكة تشمل:
- إنتاج طاقة متجددة منخفض التكلفة
- موقع جغرافي استراتيجي للتصدير
- بنية تحتية وخبرة موجودة في قطاع الطاقة
- دعم حكومي قوي وإطار سياسات واضح

تم توقيع اتفاقيات تصدير مع أسواق رئيسية في آسيا وأوروبا، مع توقعات بأن يصبح الهيدروجين صادراً غير نفطي مهماً بحلول 2030.`,
    excerpt: 'Saudi Arabia emerges as global green hydrogen leader with NEOM mega-project.',
    excerptAr: 'السعودية تبرز كرائد عالمي في الهيدروجين الأخضر مع مشروع نيوم العملاق.',
    tags: ['green-hydrogen', 'renewable-energy', 'neom', 'sustainability'],
  },
];

export async function seedContent() {
  logger.info('Starting content seeding...');

  try {
    // Check if content already exists
    const existingCount = await prisma.content.count();
    if (existingCount > 0) {
      logger.info(`Content already exists (${existingCount} items). Skipping seed.`);
      return;
    }

    // Create content
    for (const content of INITIAL_CONTENT) {
      await prisma.content.create({
        data: {
          ...content,
          tags: JSON.stringify(content.tags),
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000), // Random date within last week
        },
      });
    }

    logger.info(`Successfully seeded ${INITIAL_CONTENT.length} content items`);
  } catch (error) {
    logger.error('Failed to seed content:', error);
    throw error;
  }
}

// Run if called directly
if (process.argv[1]?.includes('seedContent')) {
  seedContent()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
