/**
 * Search Controller - البحث الموحد
 * Unified search across content, datasets, entities, signals
 */

import { Request, Response } from 'express';
import { prisma } from '../services/database.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * GET /api/search?q=...&type=...&page=...&limit=...
 * Unified search across all resources
 */
export async function search(req: Request, res: Response) {
  try {
    const q = (req.query.q as string || '').trim();
    const type = req.query.type as string || 'all';
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;

    if (!q || q.length < 2) {
      return sendError(res, 'Search query must be at least 2 characters', 'يجب أن يكون البحث حرفين على الأقل', 400);
    }

    const searchTerm = `%${q}%`;
    const results: {
      content: unknown[];
      datasets: unknown[];
      entities: unknown[];
      signals: unknown[];
    } = { content: [], datasets: [], entities: [], signals: [] };

    const counts: {
      content: number;
      datasets: number;
      entities: number;
      signals: number;
    } = { content: 0, datasets: 0, entities: 0, signals: 0 };

    // Search Content
    if (type === 'all' || type === 'content') {
      const contentWhere = {
        status: 'PUBLISHED',
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { titleAr: { contains: q, mode: 'insensitive' as const } },
          { body: { contains: q, mode: 'insensitive' as const } },
          { bodyAr: { contains: q, mode: 'insensitive' as const } },
          { tags: { contains: q, mode: 'insensitive' as const } },
        ],
      };

      const [contentItems, contentCount] = await Promise.all([
        prisma.content.findMany({
          where: contentWhere,
          select: {
            id: true,
            type: true,
            title: true,
            titleAr: true,
            excerpt: true,
            excerptAr: true,
            tags: true,
            viewCount: true,
            likeCount: true,
            publishedAt: true,
            author: { select: { id: true, name: true, nameAr: true, avatar: true } },
          },
          orderBy: { publishedAt: 'desc' },
          skip: type === 'content' ? skip : 0,
          take: type === 'content' ? limit : 5,
        }),
        prisma.content.count({ where: contentWhere }),
      ]);

      results.content = contentItems.map(c => ({
        ...c,
        tags: safeParseTags(c.tags),
        _type: 'content',
      }));
      counts.content = contentCount;
    }

    // Search Datasets
    if (type === 'all' || type === 'datasets') {
      const datasetWhere = {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { nameAr: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
          { descriptionAr: { contains: q, mode: 'insensitive' as const } },
          { category: { contains: q, mode: 'insensitive' as const } },
        ],
      };

      const [datasetItems, datasetCount] = await Promise.all([
        prisma.dataset.findMany({
          where: datasetWhere,
          select: {
            id: true,
            externalId: true,
            name: true,
            nameAr: true,
            description: true,
            descriptionAr: true,
            category: true,
            source: true,
            recordCount: true,
            lastSyncAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          skip: type === 'datasets' ? skip : 0,
          take: type === 'datasets' ? limit : 5,
        }),
        prisma.dataset.count({ where: datasetWhere }),
      ]);

      results.datasets = datasetItems.map(d => ({ ...d, _type: 'dataset' }));
      counts.datasets = datasetCount;
    }

    // Search Entities
    if (type === 'all' || type === 'entities') {
      const entityWhere = {
        isActive: true,
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { nameEn: { contains: q, mode: 'insensitive' as const } },
          { description: { contains: q, mode: 'insensitive' as const } },
          { role: { contains: q, mode: 'insensitive' as const } },
          { specialties: { contains: q, mode: 'insensitive' as const } },
        ],
      };

      const [entityItems, entityCount] = await Promise.all([
        prisma.entity.findMany({
          where: entityWhere,
          select: {
            id: true,
            name: true,
            nameEn: true,
            role: true,
            type: true,
            avatar: true,
            isVerified: true,
            verificationLevel: true,
            followersCount: true,
            specialties: true,
          },
          orderBy: { followersCount: 'desc' },
          skip: type === 'entities' ? skip : 0,
          take: type === 'entities' ? limit : 5,
        }),
        prisma.entity.count({ where: entityWhere }),
      ]);

      results.entities = entityItems.map(e => ({
        ...e,
        specialties: safeParseArray(e.specialties),
        _type: 'entity',
      }));
      counts.entities = entityCount;
    }

    // Search Signals
    if (type === 'all' || type === 'signals') {
      const signalWhere = {
        isActive: true,
        OR: [
          { title: { contains: q, mode: 'insensitive' as const } },
          { titleAr: { contains: q, mode: 'insensitive' as const } },
          { summary: { contains: q, mode: 'insensitive' as const } },
          { summaryAr: { contains: q, mode: 'insensitive' as const } },
          { sector: { contains: q, mode: 'insensitive' as const } },
          { region: { contains: q, mode: 'insensitive' as const } },
        ],
      };

      const [signalItems, signalCount] = await Promise.all([
        prisma.signal.findMany({
          where: signalWhere,
          select: {
            id: true,
            type: true,
            title: true,
            titleAr: true,
            summary: true,
            summaryAr: true,
            impactScore: true,
            confidence: true,
            trend: true,
            sector: true,
            region: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          skip: type === 'signals' ? skip : 0,
          take: type === 'signals' ? limit : 5,
        }),
        prisma.signal.count({ where: signalWhere }),
      ]);

      results.signals = signalItems.map(s => ({ ...s, _type: 'signal' }));
      counts.signals = signalCount;
    }

    const totalResults = counts.content + counts.datasets + counts.entities + counts.signals;

    // For single-type search, calculate proper pagination
    const activeCount = type === 'content' ? counts.content
      : type === 'datasets' ? counts.datasets
      : type === 'entities' ? counts.entities
      : type === 'signals' ? counts.signals
      : totalResults;

    return sendSuccess(res, {
      query: q,
      type,
      results,
      counts,
      totalResults,
    }, 200, {
      page,
      limit,
      total: activeCount,
      totalPages: Math.ceil(activeCount / limit),
    });
  } catch (error: any) {
    console.error('Search error:', error?.message || error);
    return sendError(res, 'Search failed: ' + (error?.message || ''), 'فشل البحث', 500);
  }
}

/**
 * GET /api/search/suggestions?q=...
 * Quick suggestions for autocomplete
 */
export async function searchSuggestions(req: Request, res: Response) {
  try {
    const q = (req.query.q as string || '').trim();

    if (!q || q.length < 2) {
      return sendSuccess(res, { suggestions: [] });
    }

    // Fetch top results from each category
    const [content, datasets, entities, signals] = await Promise.all([
      prisma.content.findMany({
        where: {
          status: 'PUBLISHED',
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { titleAr: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, titleAr: true, type: true },
        take: 3,
        orderBy: { viewCount: 'desc' },
      }),
      prisma.dataset.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { nameAr: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, nameAr: true, category: true },
        take: 3,
        orderBy: { recordCount: 'desc' },
      }),
      prisma.entity.findMany({
        where: {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { nameEn: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, name: true, type: true },
        take: 3,
        orderBy: { followersCount: 'desc' },
      }),
      prisma.signal.findMany({
        where: {
          isActive: true,
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { titleAr: { contains: q, mode: 'insensitive' } },
          ],
        },
        select: { id: true, titleAr: true, type: true },
        take: 3,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const suggestions = [
      ...content.map(c => ({ id: c.id, text: c.titleAr, category: 'content', subCategory: c.type })),
      ...datasets.map(d => ({ id: d.id, text: d.nameAr, category: 'dataset', subCategory: d.category })),
      ...entities.map(e => ({ id: e.id, text: e.name, category: 'entity', subCategory: e.type })),
      ...signals.map(s => ({ id: s.id, text: s.titleAr, category: 'signal', subCategory: s.type })),
    ];

    return sendSuccess(res, { suggestions });
  } catch (error) {
    console.error('Search suggestions error:', error);
    return sendSuccess(res, { suggestions: [] });
  }
}

// Helpers
function safeParseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParseArray(val: string): string[] {
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
