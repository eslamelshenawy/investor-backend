/**
 * Entity Controller - التحكم بالجهات والخبراء
 * Now uses Prisma Entity model instead of hardcoded data
 */

import { Request, Response } from 'express';
import { prisma } from '../services/database.js';

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function entityToResponse(entity: any, isFollowing: boolean = false) {
  return {
    id: entity.id,
    name: entity.name,
    nameEn: entity.nameEn,
    role: entity.role,
    type: entity.type,
    location: entity.location,
    avatar: entity.avatar,
    coverImage: entity.coverImage,
    isFollowing,
    isVerified: entity.isVerified,
    verificationLevel: entity.verificationLevel,
    stats: {
      followers: formatFollowers(entity.followersCount),
      posts: entity.postsCount,
      datasets: entity.datasetsCount,
    },
    specialties: typeof entity.specialties === 'string'
      ? JSON.parse(entity.specialties)
      : entity.specialties,
    description: entity.description,
    website: entity.website,
    establishedYear: entity.establishedYear,
    impact: entity.impact,
  };
}

/**
 * Get all entities with filtering and pagination
 */
export const getEntities = async (req: Request, res: Response) => {
  try {
    const { type, search, page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const where: any = { isActive: true };

    if (type && type !== 'all') {
      where.type = type;
    }

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { nameEn: { contains: searchStr, mode: 'insensitive' } },
        { role: { contains: searchStr, mode: 'insensitive' } },
        { description: { contains: searchStr, mode: 'insensitive' } },
        { specialties: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const [entities, total] = await Promise.all([
      prisma.entity.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { followersCount: 'desc' },
      }),
      prisma.entity.count({ where }),
    ]);

    // Check follow status if user is authenticated
    const userId = (req as any).user?.userId;
    let followedEntityIds: Set<string> = new Set();

    if (userId) {
      const follows = await prisma.follow.findMany({
        where: { followerId: userId, followType: 'ENTITY' },
        select: { followedEntityId: true },
      });
      followedEntityIds = new Set(follows.map(f => f.followedEntityId).filter(Boolean) as string[]);
    }

    const data = entities.map(e => entityToResponse(e, followedEntityIds.has(e.id)));

    res.json({
      success: true,
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Error fetching entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entities',
      errorAr: 'فشل في جلب الجهات',
    });
  }
};

/**
 * Get entity by ID
 */
export const getEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entity = await prisma.entity.findUnique({
      where: { id },
    });

    if (!entity || !entity.isActive) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found',
        errorAr: 'الجهة غير موجودة',
      });
    }

    const userId = (req as any).user?.userId;
    let isFollowing = false;

    if (userId) {
      const follow = await prisma.follow.findFirst({
        where: { followerId: userId, followType: 'ENTITY', followedEntityId: id },
      });
      isFollowing = !!follow;
    }

    res.json({
      success: true,
      data: entityToResponse(entity, isFollowing),
    });
  } catch (error) {
    console.error('Error fetching entity:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entity',
      errorAr: 'فشل في جلب الجهة',
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
      { id: 'analyst', label: 'محللون', labelEn: 'Analysts' },
    ];

    res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch entity types',
      errorAr: 'فشل في جلب أنواع الجهات',
    });
  }
};

/**
 * Follow/unfollow entity (requires auth)
 */
export const toggleFollowEntity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorAr: 'يجب تسجيل الدخول',
      });
    }

    // Check if entity exists
    const entity = await prisma.entity.findUnique({ where: { id } });
    if (!entity) {
      return res.status(404).json({
        success: false,
        error: 'Entity not found',
        errorAr: 'الجهة غير موجودة',
      });
    }

    // Check if already following using Follow model
    const existingFollow = await prisma.follow.findFirst({
      where: {
        followerId: userId,
        followType: 'ENTITY',
        followedEntityId: id,
      },
    });

    if (existingFollow) {
      // Unfollow
      await prisma.follow.delete({ where: { id: existingFollow.id } });
      // Update counter
      await prisma.entity.update({
        where: { id },
        data: { followersCount: { decrement: 1 } },
      });
      res.json({
        success: true,
        data: { isFollowing: false },
        message: 'Unfollowed successfully',
        messageAr: 'تم إلغاء المتابعة',
      });
    } else {
      // Follow
      await prisma.follow.create({
        data: {
          followerId: userId,
          followType: 'ENTITY',
          followedEntityId: id,
        },
      });
      // Update counter
      await prisma.entity.update({
        where: { id },
        data: { followersCount: { increment: 1 } },
      });
      res.json({
        success: true,
        data: { isFollowing: true },
        message: 'Followed successfully',
        messageAr: 'تمت المتابعة',
      });
    }
  } catch (error) {
    console.error('Error toggling follow:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle follow',
      errorAr: 'فشل في تحديث المتابعة',
    });
  }
};

/**
 * Get entities stream (WebFlux-style SSE)
 */
export const getEntitiesStream = async (req: Request, res: Response) => {
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
    const where: any = { isActive: true };

    if (type && type !== 'all') {
      where.type = type;
    }

    if (search) {
      const searchStr = search as string;
      where.OR = [
        { name: { contains: searchStr, mode: 'insensitive' } },
        { nameEn: { contains: searchStr, mode: 'insensitive' } },
        { role: { contains: searchStr, mode: 'insensitive' } },
        { description: { contains: searchStr, mode: 'insensitive' } },
        { specialties: { contains: searchStr, mode: 'insensitive' } },
      ];
    }

    const entities = await prisma.entity.findMany({
      where,
      orderBy: { followersCount: 'desc' },
    });

    // Send initial metadata
    sendEvent('meta', {
      total: entities.length,
      official: entities.filter(e => e.type === 'ministry' || e.type === 'authority').length,
      experts: entities.filter(e => e.type === 'expert' || e.type === 'analyst').length,
    });

    // Stream entities one by one
    for (let i = 0; i < entities.length; i++) {
      sendEvent('entity', entityToResponse(entities[i]));
      await new Promise(resolve => setTimeout(resolve, 80));
    }

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
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        errorAr: 'يجب تسجيل الدخول',
      });
    }

    const follows = await prisma.follow.findMany({
      where: {
        followerId: userId,
        followType: 'ENTITY',
      },
      include: {
        followedEntity: true,
      },
    });

    const followedEntities = follows
      .filter(f => f.followedEntity)
      .map(f => entityToResponse(f.followedEntity!, true));

    res.json({
      success: true,
      data: followedEntities,
    });
  } catch (error) {
    console.error('Error fetching followed entities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch followed entities',
      errorAr: 'فشل في جلب الجهات المتابعة',
    });
  }
};
