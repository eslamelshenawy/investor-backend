/**
 * Export Controller - خدمة التصدير
 * CSV export for datasets, signals, content
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import Papa from 'papaparse';
import { sendError } from '../utils/response.js';

const prisma = new PrismaClient();

/**
 * GET /api/export/datasets?format=csv
 * Export datasets list as CSV
 */
export async function exportDatasets(req: Request, res: Response) {
  try {
    const datasets = await prisma.dataset.findMany({
      where: { isActive: true },
      select: {
        id: true,
        externalId: true,
        name: true,
        nameAr: true,
        category: true,
        source: true,
        recordCount: true,
        syncStatus: true,
        lastSyncAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = datasets.map(d => ({
      'المعرف': d.id,
      'المعرف الخارجي': d.externalId || '',
      'الاسم': d.nameAr || d.name,
      'Name': d.name,
      'التصنيف': d.category,
      'المصدر': d.source,
      'عدد السجلات': d.recordCount,
      'حالة المزامنة': d.syncStatus,
      'آخر مزامنة': d.lastSyncAt ? new Date(d.lastSyncAt).toISOString() : '',
      'تاريخ الإنشاء': new Date(d.createdAt).toISOString(),
    }));

    return sendCsv(res, rows, 'datasets');
  } catch (error) {
    console.error('Export datasets error:', error);
    return sendError(res, 'Export failed', 'فشل التصدير', 500);
  }
}

/**
 * GET /api/export/signals?format=csv
 * Export signals as CSV
 */
export async function exportSignals(req: Request, res: Response) {
  try {
    const signals = await prisma.signal.findMany({
      where: { isActive: true },
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
        dataSource: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const rows = signals.map(s => ({
      'المعرف': s.id,
      'النوع': s.type,
      'العنوان': s.titleAr || s.title,
      'Title': s.title,
      'الملخص': s.summaryAr || s.summary,
      'درجة التأثير': Math.round(s.impactScore * 100) + '%',
      'درجة الثقة': Math.round(s.confidence * 100) + '%',
      'الاتجاه': s.trend === 'up' ? 'صاعد' : s.trend === 'down' ? 'هابط' : 'مستقر',
      'القطاع': s.sector || '',
      'المنطقة': s.region || '',
      'مصدر البيانات': s.dataSource || '',
      'التاريخ': new Date(s.createdAt).toISOString(),
    }));

    return sendCsv(res, rows, 'signals');
  } catch (error) {
    console.error('Export signals error:', error);
    return sendError(res, 'Export failed', 'فشل التصدير', 500);
  }
}

/**
 * GET /api/export/content?format=csv
 * Export published content as CSV
 */
export async function exportContent(req: Request, res: Response) {
  try {
    const content = await prisma.content.findMany({
      where: { status: 'PUBLISHED' },
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
        commentCount: true,
        shareCount: true,
        publishedAt: true,
        author: { select: { name: true, nameAr: true } },
      },
      orderBy: { publishedAt: 'desc' },
    });

    const rows = content.map(c => ({
      'المعرف': c.id,
      'النوع': c.type,
      'العنوان': c.titleAr || c.title,
      'Title': c.title,
      'المقتطف': c.excerptAr || c.excerpt || '',
      'الكاتب': c.author?.nameAr || c.author?.name || '',
      'الوسوم': safeParseTags(c.tags).join(', '),
      'المشاهدات': c.viewCount,
      'الإعجابات': c.likeCount,
      'التعليقات': c.commentCount,
      'المشاركات': c.shareCount,
      'تاريخ النشر': c.publishedAt ? new Date(c.publishedAt).toISOString() : '',
    }));

    return sendCsv(res, rows, 'content');
  } catch (error) {
    console.error('Export content error:', error);
    return sendError(res, 'Export failed', 'فشل التصدير', 500);
  }
}

/**
 * GET /api/export/entities?format=csv
 * Export entities as CSV
 */
export async function exportEntities(req: Request, res: Response) {
  try {
    const entities = await prisma.entity.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        nameEn: true,
        role: true,
        type: true,
        location: true,
        isVerified: true,
        verificationLevel: true,
        followersCount: true,
        postsCount: true,
        specialties: true,
        description: true,
        website: true,
        createdAt: true,
      },
      orderBy: { followersCount: 'desc' },
    });

    const rows = entities.map(e => ({
      'المعرف': e.id,
      'الاسم': e.name,
      'Name (EN)': e.nameEn || '',
      'الدور': e.role,
      'النوع': e.type,
      'الموقع': e.location || '',
      'موثق': e.isVerified ? 'نعم' : 'لا',
      'مستوى التوثيق': e.verificationLevel,
      'المتابعون': e.followersCount,
      'المنشورات': e.postsCount,
      'التخصصات': safeParseArray(e.specialties).join(', '),
      'الوصف': e.description || '',
      'الموقع الإلكتروني': e.website || '',
    }));

    return sendCsv(res, rows, 'entities');
  } catch (error) {
    console.error('Export entities error:', error);
    return sendError(res, 'Export failed', 'فشل التصدير', 500);
  }
}

/**
 * GET /api/export/dataset/:id?format=csv
 * Export specific dataset data as CSV
 */
export async function exportDatasetData(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const dataset = await prisma.dataset.findUnique({
      where: { id },
      select: { id: true, name: true, nameAr: true },
    });

    if (!dataset) {
      return sendError(res, 'Dataset not found', 'مجموعة البيانات غير موجودة', 404);
    }

    const records = await prisma.dataRecord.findMany({
      where: { datasetId: id },
      select: { data: true },
      take: 10000,
    });

    if (records.length === 0) {
      return sendError(res, 'No data available', 'لا توجد بيانات متاحة', 404);
    }

    const rows = records.map(r => {
      try {
        return typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
      } catch {
        return r.data;
      }
    });

    const filename = (dataset.nameAr || dataset.name).replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
    return sendCsv(res, rows as Record<string, unknown>[], filename);
  } catch (error) {
    console.error('Export dataset data error:', error);
    return sendError(res, 'Export failed', 'فشل التصدير', 500);
  }
}

// Helpers
function sendCsv(res: Response, data: Record<string, unknown>[], filename: string) {
  const csv = Papa.unparse(data, { header: true });
  // Add BOM for proper Arabic display in Excel
  const bom = '\uFEFF';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}_${Date.now()}.csv"`);
  return res.send(bom + csv);
}

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
