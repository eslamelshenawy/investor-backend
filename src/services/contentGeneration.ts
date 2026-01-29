/**
 * Content Generation Service - خدمة توليد المحتوى
 * Uses OpenAI to generate articles, reports, and insights
 */

import { config } from '../config/index.js';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface GeneratedContent {
  title: string;
  titleAr: string;
  body: string;
  bodyAr: string;
  excerpt: string;
  excerptAr: string;
  tags: string[];
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string, systemPrompt: string): Promise<string | null> {
  if (!config.openaiApiKey) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: config.openaiModel || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`OpenAI API error: ${response.status} - ${errorText}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    logger.error('OpenAI API call failed:', error);
    return null;
  }
}

/**
 * Generate an article based on a signal
 */
export async function generateArticleFromSignal(signalId: string): Promise<GeneratedContent | null> {
  const signal = await prisma.signal.findUnique({ where: { id: signalId } });
  if (!signal) {
    logger.error(`Signal not found: ${signalId}`);
    return null;
  }

  const systemPrompt = `أنت كاتب اقتصادي محترف متخصص في تحليل السوق السعودي.
اكتب مقالات موضوعية ومدعومة بالبيانات باللغتين العربية والإنجليزية.
أجب بتنسيق JSON فقط.`;

  const prompt = `بناءً على الإشارة التالية، اكتب مقالاً تحليلياً قصيراً:

العنوان: ${signal.titleAr || signal.title}
الملخص: ${signal.summaryAr || signal.summary}
النوع: ${signal.type}
القطاع: ${signal.sector || 'عام'}
المنطقة: ${signal.region || 'وطني'}
درجة التأثير: ${signal.impactScore}%

أعد الرد بتنسيق JSON التالي:
{
  "title": "العنوان بالإنجليزية",
  "titleAr": "العنوان بالعربية",
  "body": "المقال الكامل بالإنجليزية (3-4 فقرات)",
  "bodyAr": "المقال الكامل بالعربية (3-4 فقرات)",
  "excerpt": "ملخص قصير بالإنجليزية (جملة واحدة)",
  "excerptAr": "ملخص قصير بالعربية (جملة واحدة)",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  const response = await callOpenAI(prompt, systemPrompt);
  if (!response) return null;

  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      logger.error('No JSON found in OpenAI response');
      return null;
    }
    return JSON.parse(jsonMatch[0]) as GeneratedContent;
  } catch (error) {
    logger.error('Failed to parse OpenAI response:', error);
    return null;
  }
}

/**
 * Generate a market report based on multiple signals
 */
export async function generateMarketReport(): Promise<GeneratedContent | null> {
  const signals = await prisma.signal.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  if (signals.length === 0) {
    logger.warn('No signals available for market report');
    return null;
  }

  const signalsSummary = signals.map(s =>
    `- ${s.titleAr}: ${s.summaryAr} (${s.type}, تأثير: ${s.impactScore}%)`
  ).join('\n');

  const systemPrompt = `أنت محلل اقتصادي متخصص في السوق السعودي.
اكتب تقارير شاملة ومهنية باللغتين العربية والإنجليزية.
أجب بتنسيق JSON فقط.`;

  const prompt = `اكتب تقريراً يومياً للسوق بناءً على الإشارات التالية:

${signalsSummary}

أعد الرد بتنسيق JSON التالي:
{
  "title": "Daily Market Report - [Date]",
  "titleAr": "التقرير اليومي للسوق - [التاريخ]",
  "body": "التقرير الكامل بالإنجليزية (4-5 فقرات تغطي جميع الإشارات)",
  "bodyAr": "التقرير الكامل بالعربية (4-5 فقرات تغطي جميع الإشارات)",
  "excerpt": "ملخص التقرير بالإنجليزية",
  "excerptAr": "ملخص التقرير بالعربية",
  "tags": ["market-report", "daily", "analysis"]
}`;

  const response = await callOpenAI(prompt, systemPrompt);
  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as GeneratedContent;
  } catch (error) {
    logger.error('Failed to parse market report:', error);
    return null;
  }
}

/**
 * Generate sector analysis
 */
export async function generateSectorAnalysis(sector: string): Promise<GeneratedContent | null> {
  const signals = await prisma.signal.findMany({
    where: {
      isActive: true,
      sector: { contains: sector, mode: 'insensitive' }
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  });

  const datasets = await prisma.dataset.findMany({
    where: {
      category: { contains: sector, mode: 'insensitive' }
    },
    take: 3,
  });

  const systemPrompt = `أنت محلل قطاعي متخصص في الاقتصاد السعودي.
اكتب تحليلات عميقة ومفصلة للقطاعات الاقتصادية.
أجب بتنسيق JSON فقط.`;

  const prompt = `اكتب تحليلاً شاملاً لقطاع "${sector}" في السعودية.

الإشارات المتعلقة:
${signals.map(s => `- ${s.titleAr}: ${s.type}`).join('\n') || 'لا توجد إشارات حالية'}

مجموعات البيانات المتعلقة:
${datasets.map(d => `- ${d.titleAr || d.title}`).join('\n') || 'لا توجد بيانات'}

أعد الرد بتنسيق JSON التالي:
{
  "title": "Sector Analysis: ${sector}",
  "titleAr": "تحليل قطاعي: ${sector}",
  "body": "التحليل الكامل بالإنجليزية",
  "bodyAr": "التحليل الكامل بالعربية",
  "excerpt": "ملخص قصير بالإنجليزية",
  "excerptAr": "ملخص قصير بالعربية",
  "tags": ["sector-analysis", "${sector.toLowerCase()}"]
}`;

  const response = await callOpenAI(prompt, systemPrompt);
  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as GeneratedContent;
  } catch (error) {
    logger.error('Failed to parse sector analysis:', error);
    return null;
  }
}

/**
 * Create and save generated content
 */
export async function createGeneratedContent(
  type: string,
  content: GeneratedContent,
  datasetId?: string
) {
  return prisma.content.create({
    data: {
      type,
      title: content.title,
      titleAr: content.titleAr,
      body: content.body,
      bodyAr: content.bodyAr,
      excerpt: content.excerpt,
      excerptAr: content.excerptAr,
      tags: JSON.stringify(content.tags),
      datasetId,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
}

export default {
  generateArticleFromSignal,
  generateMarketReport,
  generateSectorAnalysis,
  createGeneratedContent,
};
