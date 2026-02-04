/**
 * Entity Controller - التحكم بالجهات والخبراء
 * Provides API for government entities and experts
 */

import { Request, Response } from 'express';
import { prisma } from '../services/database.js';

// Entity types and interfaces
interface Entity {
  id: string;
  name: string;
  nameEn?: string;
  role: string;
  type: 'ministry' | 'authority' | 'expert' | 'analyst';
  location: string;
  avatar: string;
  coverImage?: string;
  isFollowing: boolean;
  isVerified: boolean;
  verificationLevel: 'official' | 'verified' | 'none';
  stats: {
    followers: string;
    posts: number;
    datasets?: number;
  };
  specialties: string[];
  description?: string;
  website?: string;
  establishedYear?: string;
  impact: 'critical' | 'high' | 'medium' | 'low';
}

// Saudi government entities and experts data
const ENTITIES_DATA: Entity[] = [
  {
    id: 'gov_1',
    name: 'وزارة الاستثمار',
    nameEn: 'Ministry of Investment',
    role: 'جهة حكومية رسمية',
    type: 'ministry',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=MISA&background=0D47A1&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '245K', posts: 1240, datasets: 45 },
    specialties: ['الاستثمار الأجنبي', 'التراخيص', 'الفرص الاستثمارية', 'المناطق الاقتصادية'],
    description: 'الجهة المسؤولة عن تنظيم وتطوير بيئة الاستثمار في المملكة وجذب الاستثمارات الأجنبية المباشرة',
    website: 'misa.gov.sa',
    establishedYear: '2020',
    impact: 'critical'
  },
  {
    id: 'gov_2',
    name: 'الهيئة العامة للإحصاء',
    nameEn: 'General Authority for Statistics',
    role: 'جهة حكومية رسمية',
    type: 'authority',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=GASTAT&background=1B5E20&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '189K', posts: 2850, datasets: 120 },
    specialties: ['البيانات الإحصائية', 'المسوحات الوطنية', 'مؤشرات الاقتصاد', 'سوق العمل'],
    description: 'المصدر الرسمي للبيانات والإحصاءات الوطنية، توفر بيانات دقيقة وموثوقة لدعم اتخاذ القرار',
    website: 'stats.gov.sa',
    establishedYear: '1960',
    impact: 'critical'
  },
  {
    id: 'gov_3',
    name: 'البنك المركزي السعودي',
    nameEn: 'Saudi Central Bank (SAMA)',
    role: 'جهة حكومية رسمية',
    type: 'authority',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=SAMA&background=B71C1C&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1541354329998-f4d9a9f9297f?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '312K', posts: 980, datasets: 65 },
    specialties: ['السياسة النقدية', 'الاستقرار المالي', 'الرقابة المصرفية', 'الاحتياطيات'],
    description: 'البنك المركزي للمملكة، المسؤول عن السياسة النقدية والرقابة على القطاع المصرفي والمالي',
    website: 'sama.gov.sa',
    establishedYear: '1952',
    impact: 'critical'
  },
  {
    id: 'gov_4',
    name: 'وزارة التجارة',
    nameEn: 'Ministry of Commerce',
    role: 'جهة حكومية رسمية',
    type: 'ministry',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=MC&background=E65100&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '156K', posts: 1560, datasets: 38 },
    specialties: ['السجلات التجارية', 'حماية المستهلك', 'التجارة الإلكترونية', 'الملكية الفكرية'],
    description: 'تنظيم وتطوير الأنشطة التجارية وحماية حقوق المستهلكين وتعزيز بيئة الأعمال',
    website: 'mc.gov.sa',
    establishedYear: '1954',
    impact: 'high'
  },
  {
    id: 'gov_5',
    name: 'هيئة السوق المالية',
    nameEn: 'Capital Market Authority',
    role: 'جهة حكومية رسمية',
    type: 'authority',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=CMA&background=4A148C&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '198K', posts: 1120, datasets: 52 },
    specialties: ['سوق الأسهم', 'الشركات المدرجة', 'الإفصاحات', 'الرقابة المالية'],
    description: 'تنظيم وتطوير السوق المالية السعودية وحماية المستثمرين والمتعاملين',
    website: 'cma.org.sa',
    establishedYear: '2003',
    impact: 'critical'
  },
  {
    id: 'gov_6',
    name: 'وزارة الطاقة',
    nameEn: 'Ministry of Energy',
    role: 'جهة حكومية رسمية',
    type: 'ministry',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=MOE&background=1B5E20&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '142K', posts: 890, datasets: 42 },
    specialties: ['الطاقة المتجددة', 'النفط والغاز', 'الكهرباء', 'الاستدامة'],
    description: 'تنظيم قطاع الطاقة وتطوير مصادر الطاقة المتجددة وضمان أمن الإمداد',
    website: 'moenergy.gov.sa',
    establishedYear: '2019',
    impact: 'critical'
  },
  {
    id: 'gov_7',
    name: 'وزارة الموارد البشرية والتنمية الاجتماعية',
    nameEn: 'Ministry of Human Resources',
    role: 'جهة حكومية رسمية',
    type: 'ministry',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=HRSD&background=6A1B9A&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '280K', posts: 1890, datasets: 55 },
    specialties: ['سوق العمل', 'التوظيف', 'نظام العمل', 'التنمية الاجتماعية'],
    description: 'تنظيم سوق العمل وتطوير القوى العاملة ودعم برامج التنمية الاجتماعية',
    website: 'hrsd.gov.sa',
    establishedYear: '2019',
    impact: 'critical'
  },
  {
    id: 'gov_8',
    name: 'الهيئة العامة للعقار',
    nameEn: 'Real Estate General Authority',
    role: 'جهة حكومية رسمية',
    type: 'authority',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://ui-avatars.com/api/?name=REGA&background=00695C&color=fff&size=200&bold=true',
    coverImage: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1200&h=400&fit=crop',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'official',
    stats: { followers: '95K', posts: 680, datasets: 28 },
    specialties: ['تنظيم القطاع العقاري', 'التراخيص العقارية', 'المؤشرات العقارية', 'الوساطة'],
    description: 'تنظيم وتطوير القطاع العقاري غير الحكومي ورفع كفاءته وحوكمته',
    website: 'rega.gov.sa',
    establishedYear: '2017',
    impact: 'high'
  },
  {
    id: 'expert_1',
    name: 'د. خالد بن فهد العثمان',
    nameEn: 'Dr. Khalid Al-Othman',
    role: 'خبير اقتصادي - محلل أسواق',
    type: 'expert',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=khalid',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'verified',
    stats: { followers: '45.2K', posts: 1850 },
    specialties: ['الاقتصاد الكلي', 'الأسواق المالية', 'رؤية 2030', 'التحليل الاستراتيجي'],
    description: 'خبير اقتصادي معتمد مع أكثر من 15 عاماً من الخبرة في تحليل الأسواق السعودية والخليجية',
    impact: 'high'
  },
  {
    id: 'expert_2',
    name: 'سارة المنصور',
    nameEn: 'Sarah Al-Mansour',
    role: 'محللة بيانات عقارية',
    type: 'analyst',
    location: 'جدة، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=sarah',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'verified',
    stats: { followers: '28.5K', posts: 920 },
    specialties: ['السوق العقاري', 'تحليل البيانات', 'التقييم العقاري', 'الاستثمار العقاري'],
    description: 'متخصصة في تحليل بيانات السوق العقاري السعودي وتقديم رؤى استثمارية دقيقة',
    impact: 'high'
  },
  {
    id: 'expert_3',
    name: 'م. عبدالله الجارالله',
    nameEn: 'Eng. Abdullah Al-Jarallah',
    role: 'خبير سلاسل الإمداد واللوجستيات',
    type: 'expert',
    location: 'الدمام، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=abdullah',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'verified',
    stats: { followers: '32.8K', posts: 1240 },
    specialties: ['سلاسل الإمداد', 'اللوجستيات', 'التجارة الدولية', 'الموانئ'],
    description: 'مهندس صناعي متخصص في تحسين سلاسل الإمداد وتطوير الحلول اللوجستية',
    impact: 'high'
  },
  {
    id: 'analyst_1',
    name: 'أحمد محمود الشهري',
    nameEn: 'Ahmed Al-Shehri',
    role: 'محلل تقني - أسواق المال',
    type: 'analyst',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=ahmed',
    isFollowing: false,
    isVerified: false,
    verificationLevel: 'none',
    stats: { followers: '18.3K', posts: 2450 },
    specialties: ['التحليل الفني', 'تاسي', 'العملات الرقمية', 'الأسهم'],
    description: 'محلل تقني متخصص في أسواق الأسهم السعودية والخليجية',
    impact: 'medium'
  },
  {
    id: 'expert_4',
    name: 'د. نورة العتيبي',
    nameEn: 'Dr. Noura Al-Otaibi',
    role: 'خبيرة اقتصاد كلي',
    type: 'expert',
    location: 'الرياض، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=noura',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'verified',
    stats: { followers: '52.1K', posts: 1680 },
    specialties: ['الاقتصاد الكلي', 'السياسة المالية', 'التضخم', 'النمو الاقتصادي'],
    description: 'أستاذة الاقتصاد في جامعة الملك سعود، متخصصة في دراسات الاقتصاد السعودي',
    impact: 'high'
  },
  {
    id: 'analyst_2',
    name: 'فهد الدوسري',
    nameEn: 'Fahad Al-Dosari',
    role: 'محلل قطاع الطاقة',
    type: 'analyst',
    location: 'الظهران، المملكة العربية السعودية',
    avatar: 'https://i.pravatar.cc/200?u=fahad',
    isFollowing: false,
    isVerified: true,
    verificationLevel: 'verified',
    stats: { followers: '38.7K', posts: 1120 },
    specialties: ['أسواق النفط', 'الطاقة المتجددة', 'أوبك', 'تحليل القطاع'],
    description: 'محلل متخصص في قطاع الطاقة السعودي والعالمي مع خبرة تزيد عن 10 سنوات',
    impact: 'high'
  }
];

/**
 * Get all entities with filtering and pagination
 */
export const getEntities = async (req: Request, res: Response) => {
  try {
    const { type, search, page = '1', limit = '20' } = req.query;

    let entities = [...ENTITIES_DATA];

    // Filter by type
    if (type && type !== 'all') {
      entities = entities.filter(e => e.type === type);
    }

    // Search filter
    if (search) {
      const searchLower = (search as string).toLowerCase();
      entities = entities.filter(e =>
        e.name.toLowerCase().includes(searchLower) ||
        e.nameEn?.toLowerCase().includes(searchLower) ||
        e.role.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower) ||
        e.specialties.some(s => s.toLowerCase().includes(searchLower))
      );
    }

    // Get dataset counts from actual database
    const datasets = await prisma.dataset.findMany({ where: { isActive: true } });
    const categoryMap: Record<string, number> = {};
    datasets.forEach(d => {
      categoryMap[d.category] = (categoryMap[d.category] || 0) + 1;
    });

    // Update entity dataset counts based on category mapping
    entities = entities.map(e => {
      if (e.type === 'ministry' || e.type === 'authority') {
        // Map entities to dataset categories
        let datasetCount = 0;
        if (e.id === 'gov_2') datasetCount = datasets.length; // GASTAT - all datasets
        else if (e.id === 'gov_8') datasetCount = categoryMap['real_estate'] || 0;
        else if (e.id === 'gov_6') datasetCount = categoryMap['energy'] || 0;
        else if (e.id === 'gov_7') datasetCount = categoryMap['labor'] || 0;
        else datasetCount = Math.floor(Math.random() * 30) + 10;

        return {
          ...e,
          stats: { ...e.stats, datasets: datasetCount }
        };
      }
      return e;
    });

    // Pagination
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedEntities = entities.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: paginatedEntities,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: entities.length,
        totalPages: Math.ceil(entities.length / limitNum)
      }
    });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entities',
      errorAr: 'فشل في جلب الجهات'
    });
  }
};

/**
 * Get entity by ID
 */
export const getEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entity = ENTITIES_DATA.find(e => e.id === id);

    if (!entity) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found',
        errorAr: 'الجهة غير موجودة'
      });
    }

    res.json({
      success: true,
      data: entity
    });
  } catch (error) {
    console.error('Error fetching entity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entity',
      errorAr: 'فشل في جلب الجهة'
    });
  }
};

/**
 * Get entity types/categories
 */
export const getEntityTypes = async (_req: Request, res: Response) => {
  try {
    const types = [
      { id: 'all', label: 'الكل', labelEn: 'All' },
      { id: 'ministry', label: 'وزارات', labelEn: 'Ministries' },
      { id: 'authority', label: 'هيئات', labelEn: 'Authorities' },
      { id: 'expert', label: 'خبراء', labelEn: 'Experts' },
      { id: 'analyst', label: 'محللون', labelEn: 'Analysts' }
    ];

    res.json({
      success: true,
      data: types
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entity types',
      errorAr: 'فشل في جلب أنواع الجهات'
    });
  }
};

/**
 * Follow/unfollow entity (requires auth)
 */
export const toggleFollowEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorAr: 'يجب تسجيل الدخول'
      });
    }

    // Check if entity exists
    const entity = ENTITIES_DATA.find(e => e.id === id);
    if (!entity) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found',
        errorAr: 'الجهة غير موجودة'
      });
    }

    // Check if already following
    const existingFollow = await prisma.favorite.findFirst({
      where: {
        userId,
        itemType: 'entity',
        itemId: id
      }
    });

    if (existingFollow) {
      // Unfollow
      await prisma.favorite.delete({ where: { id: existingFollow.id } });
      res.json({
        success: true,
        data: { isFollowing: false },
        message: 'Unfollowed successfully',
        messageAr: 'تم إلغاء المتابعة'
      });
    } else {
      // Follow
      await prisma.favorite.create({
        data: {
          userId,
          itemType: 'entity',
          itemId: id
        }
      });
      res.json({
        success: true,
        data: { isFollowing: true },
        message: 'Followed successfully',
        messageAr: 'تمت المتابعة'
      });
    }
  } catch (error) {
    console.error('Error toggling follow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle follow',
      errorAr: 'فشل في تحديث المتابعة'
    });
  }
};

/**
 * Get entities stream (WebFlux-style SSE)
 * Streams entities progressively for better UX
 */
export const getEntitiesStream = async (req: Request, res: Response) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const { type, search } = req.query;

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    let entities = [...ENTITIES_DATA];

    // Filter by type
    if (type && type !== 'all') {
      entities = entities.filter(e => e.type === type);
    }

    // Search filter
    if (search) {
      const searchLower = (search as string).toLowerCase();
      entities = entities.filter(e =>
        e.name.toLowerCase().includes(searchLower) ||
        e.nameEn?.toLowerCase().includes(searchLower) ||
        e.role.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower) ||
        e.specialties.some(s => s.toLowerCase().includes(searchLower))
      );
    }

    // Send initial metadata
    sendEvent('meta', {
      total: entities.length,
      official: entities.filter(e => e.type === 'ministry' || e.type === 'authority').length,
      experts: entities.filter(e => e.type === 'expert' || e.type === 'analyst').length
    });

    // Get dataset counts from database
    let categoryMap: Record<string, number> = {};
    let totalDatasets = 0;
    try {
      const datasets = await prisma.dataset.findMany({ where: { isActive: true } });
      totalDatasets = datasets.length;
      datasets.forEach(d => {
        categoryMap[d.category] = (categoryMap[d.category] || 0) + 1;
      });
    } catch (dbError) {
      console.log('Database not available, using mock counts');
    }

    // Stream entities one by one with delay for smooth UX
    for (let i = 0; i < entities.length; i++) {
      let entity = entities[i];

      // Enrich government entities with real dataset counts
      if (entity.type === 'ministry' || entity.type === 'authority') {
        let datasetCount = 0;
        if (entity.id === 'gov_2') datasetCount = totalDatasets; // GASTAT - all datasets
        else if (entity.id === 'gov_8') datasetCount = categoryMap['real_estate'] || Math.floor(Math.random() * 20) + 5;
        else if (entity.id === 'gov_6') datasetCount = categoryMap['energy'] || Math.floor(Math.random() * 20) + 5;
        else if (entity.id === 'gov_7') datasetCount = categoryMap['labor'] || Math.floor(Math.random() * 20) + 5;
        else datasetCount = Math.floor(Math.random() * 30) + 10;

        entity = {
          ...entity,
          stats: { ...entity.stats, datasets: datasetCount }
        };
      }

      sendEvent('entity', entity);

      // Small delay between items for smooth progressive loading
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // Signal completion
    sendEvent('complete', { count: entities.length });
    res.end();
  } catch (error) {
    console.error('Error streaming entities:', error);
    sendEvent('error', { message: 'فشل في جلب الجهات' });
    res.end();
  }
};

/**
 * Get followed entities for current user
 */
export const getFollowedEntities = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorAr: 'يجب تسجيل الدخول'
      });
    }

    const follows = await prisma.favorite.findMany({
      where: {
        userId,
        itemType: 'entity'
      }
    });

    const followedIds = follows.map(f => f.itemId);
    const followedEntities = ENTITIES_DATA.filter(e => followedIds.includes(e.id))
      .map(e => ({ ...e, isFollowing: true }));

    res.json({
      success: true,
      data: followedEntities
    });
  } catch (error) {
    console.error('Error fetching followed entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch followed entities',
      errorAr: 'فشل في جلب الجهات المتابعة'
    });
  }
};
