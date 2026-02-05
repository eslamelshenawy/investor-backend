/**
 * AI Analysis Service - خدمة تحليل الذكاء الاصطناعي
 * Uses OpenAI API for analyzing economic data and generating signals
 * NO MOCK DATA - All data must be real
 */

import { config } from '../config/index.js';
import { prisma } from './database.js';
import { logger } from '../utils/logger.js';
import { generateRealSignals } from './realSignalGenerator.js';

// OpenAI API Configuration
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';

interface OpenAIResponse {
  choices?: {
    message: {
      content: string;
    };
  }[];
  error?: {
    message: string;
  };
}

interface AnalysisResult {
  signals: SignalData[];
  insights: InsightData[];
  summary: string;
  summaryAr: string;
}

interface SignalData {
  type: 'OPPORTUNITY' | 'RISK' | 'TREND' | 'ALERT';
  title: string;
  titleAr: string;
  summary: string;
  summaryAr: string;
  impactScore: number;
  confidence: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  region?: string;
  sector?: string;
  relatedDatasets: string[];
  indicators: Record<string, unknown>;
  explanation?: {
    why: string;
    dataUsed: string[];
    assumptions: string[];
    limitations: string[];
  };
}

interface InsightData {
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  category: string;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(prompt: string): Promise<string | null> {
  if (!config.openaiApiKey) {
    logger.warn('OpenAI API key not configured');
    return null;
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openaiApiKey.replace(/\s+/g, '')}`,
      },
      body: JSON.stringify({
        model: config.openaiModel,
        messages: [
          {
            role: 'system',
            content: 'أنت محلل اقتصادي خبير متخصص في الاقتصاد السعودي. تقوم بتحليل البيانات وتوليد إشارات استثمارية دقيقة. أجب دائماً بصيغة JSON فقط.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    });

    const data: OpenAIResponse = await response.json();

    if (data.error) {
      logger.error('OpenAI API error:', data.error.message);
      return null;
    }

    return data.choices?.[0]?.message?.content || null;
  } catch (error) {
    logger.error('Error calling OpenAI API:', error);
    return null;
  }
}

/**
 * Analyze datasets and generate signals
 * OPTIMIZED: Reduced memory usage for 512MB limit
 */
export async function analyzeDatasets(): Promise<AnalysisResult | null> {
  logger.info('Starting AI analysis of datasets...');

  try {
    // Check if OpenAI is available first (before loading data)
    if (!config.openaiApiKey || config.openaiApiKey === 'sk-your-openai-api-key') {
      logger.info('OpenAI not configured, using real data analysis');
      return generateRealSignals();
    }

    // OPTIMIZED: Load only 50 records with minimal data to save memory
    const recentRecords = await prisma.dataRecord.findMany({
      take: 50, // Reduced from 1000
      orderBy: { recordedAt: 'desc' },
      select: {
        data: true,
        recordedAt: true,
        dataset: {
          select: {
            name: true,
            nameAr: true,
            category: true,
          },
        },
      },
    });

    if (recentRecords.length === 0) {
      logger.info('No data records, using real signal generator');
      return generateRealSignals();
    }

    // Group data by category (limit data size)
    const dataByCategory: Record<string, unknown[]> = {};
    for (const record of recentRecords) {
      const category = record.dataset.category;
      if (!dataByCategory[category]) {
        dataByCategory[category] = [];
      }
      // Limit to 5 records per category to save memory
      if (dataByCategory[category].length < 5) {
        try {
          const parsedData = JSON.parse(record.data);
          // Only keep first 10 fields to limit size
          const limitedData = Object.fromEntries(
            Object.entries(parsedData).slice(0, 10)
          );
          dataByCategory[category].push({
            dataset: record.dataset.name,
            datasetAr: record.dataset.nameAr,
            data: limitedData,
            date: record.recordedAt,
          });
        } catch {
          // Skip records with invalid JSON
        }
      }
    }

    // Create analysis prompt
    const prompt = createAnalysisPrompt(dataByCategory);

    // Call OpenAI
    const response = await callOpenAI(prompt);

    if (!response) {
      // NO MOCK DATA - Use real signal generator instead
      logger.warn('OpenAI call failed, falling back to real data analysis');
      return generateRealSignals();
    }

    // Parse response
    const analysis = parseAnalysisResponse(response);

    // If parsing failed, fallback to real data analysis
    if (!analysis || !analysis.signals) {
      logger.warn('Failed to parse OpenAI response, falling back to real data analysis');
      return generateRealSignals();
    }

    // Save signals to database
    await saveSignals(analysis.signals);

    logger.info(`AI analysis complete. Generated ${analysis.signals.length} signals`);

    return analysis;
  } catch (error) {
    logger.error('Error in AI analysis:', error);
    return null;
  }
}

/**
 * Create analysis prompt for Gemini
 */
function createAnalysisPrompt(dataByCategory: Record<string, unknown[]>): string {
  const dataSummary = Object.entries(dataByCategory)
    .map(([category, records]) => {
      return `
## ${category}
${JSON.stringify(records.slice(0, 10), null, 2)}
`;
    })
    .join('\n');

  return `
أنت محلل اقتصادي خبير متخصص في الاقتصاد السعودي. قم بتحليل البيانات التالية وتوليد إشارات استثمارية.

البيانات المتاحة:
${dataSummary}

المطلوب:
1. تحليل الاتجاهات والأنماط في البيانات
2. تحديد الفرص الاستثمارية المحتملة
3. تحديد المخاطر المحتملة
4. توليد إشارات واضحة للمستثمرين

أعد الإجابة بصيغة JSON كالتالي:
{
  "signals": [
    {
      "type": "OPPORTUNITY|RISK|TREND|ALERT",
      "title": "English title",
      "titleAr": "العنوان بالعربية",
      "summary": "English summary",
      "summaryAr": "الملخص بالعربية",
      "impactScore": 0-100,
      "confidence": 0-100,
      "trend": "UP|DOWN|STABLE",
      "region": "optional region",
      "sector": "optional sector",
      "relatedDatasets": ["dataset names"],
      "indicators": {},
      "explanation": {
        "why": "سبب ظهور هذه الإشارة بالعربية - اشرح المنطق والأسباب",
        "dataUsed": ["اسم مجموعة البيانات 1", "اسم مجموعة البيانات 2"],
        "assumptions": ["الافتراض الأول بالعربية", "الافتراض الثاني"],
        "limitations": ["القيد الأول بالعربية", "القيد الثاني"]
      }
    }
  ],
  "insights": [
    {
      "title": "English title",
      "titleAr": "العنوان بالعربية",
      "description": "English description",
      "descriptionAr": "الوصف بالعربية",
      "category": "category name"
    }
  ],
  "summary": "Overall market summary in English",
  "summaryAr": "ملخص السوق العام بالعربية"
}

أجب بـ JSON فقط بدون أي نص إضافي.
`;
}

/**
 * Parse Gemini response into structured analysis
 */
function parseAnalysisResponse(response: string): AnalysisResult {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      signals: parsed.signals || [],
      insights: parsed.insights || [],
      summary: parsed.summary || '',
      summaryAr: parsed.summaryAr || '',
    };
  } catch (error) {
    logger.error('Error parsing AI response:', error);
    // NO MOCK DATA - return null to trigger real data analysis
    return null as unknown as AnalysisResult;
  }
}

// REMOVED: generateMockAnalysis - NO FAKE DATA ALLOWED
// All signals must come from real data analysis

/**
 * Save signals to database
 */
async function saveSignals(signals: SignalData[]): Promise<void> {
  for (const signal of signals) {
    try {
      await prisma.signal.create({
        data: {
          type: signal.type,
          title: signal.title,
          titleAr: signal.titleAr,
          summary: signal.summary,
          summaryAr: signal.summaryAr,
          impactScore: signal.impactScore,
          confidence: signal.confidence,
          trend: signal.trend,
          region: signal.region,
          sector: signal.sector,
          dataSource: 'AI_ANALYSIS',
          details: JSON.stringify({
            relatedDatasets: signal.relatedDatasets,
            indicators: signal.indicators,
            explanation: signal.explanation || null,
          }),
          isActive: true,
        },
      });
    } catch (error) {
      logger.error(`Error saving signal: ${signal.title}`, error);
    }
  }
}

/**
 * Get signals for a specific region or sector
 */
export async function getSignalsByFilter(filter: {
  region?: string;
  sector?: string;
  type?: string;
  limit?: number;
}): Promise<unknown[]> {
  const where: Record<string, unknown> = { isActive: true };

  if (filter.region) where.region = filter.region;
  if (filter.sector) where.sector = filter.sector;
  if (filter.type) where.type = filter.type;

  return prisma.signal.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: filter.limit || 20,
  });
}

/**
 * Analyze a specific dataset
 */
export async function analyzeDataset(datasetId: string): Promise<SignalData[] | null> {
  try {
    const dataset = await prisma.dataset.findUnique({
      where: { id: datasetId },
    });

    if (!dataset) {
      logger.error(`Dataset not found: ${datasetId}`);
      return null;
    }

    const records = await prisma.dataRecord.findMany({
      where: { datasetId },
      orderBy: { recordedAt: 'desc' },
      take: 100,
    });

    if (records.length === 0) {
      return [];
    }

    const prompt = `
أنت محلل اقتصادي. حلل البيانات التالية من مجموعة بيانات "${dataset.nameAr}":

${JSON.stringify(records.slice(0, 20).map(r => JSON.parse(r.data)), null, 2)}

أعد قائمة بأهم 3 إشارات استثمارية بصيغة JSON:
{
  "signals": [
    {
      "type": "OPPORTUNITY|RISK|TREND|ALERT",
      "title": "English title",
      "titleAr": "العنوان بالعربية",
      "summary": "English summary (max 100 words)",
      "summaryAr": "الملخص بالعربية (100 كلمة كحد أقصى)",
      "impactScore": 0-100,
      "confidence": 0-100,
      "trend": "UP|DOWN|STABLE"
    }
  ]
}
`;

    const response = await callOpenAI(prompt);

    if (!response) {
      return [];
    }

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.signals || [];
      }
    } catch {
      logger.error('Error parsing dataset analysis response');
    }

    return [];
  } catch (error) {
    logger.error('Error analyzing dataset:', error);
    return null;
  }
}

/**
 * Daily summary result with structured key points
 */
export interface DailySummaryResult {
  summary: string;
  summaryAr: string;
  keyPoints?: Array<{
    title: string;
    description: string;
    impact: 'positive' | 'negative' | 'neutral';
    sector?: string;
  }>;
  marketMood?: 'bullish' | 'bearish' | 'neutral';
  topSectors?: string[];
  signalStats?: {
    total: number;
    opportunities: number;
    risks: number;
    trends: number;
  };
}

/**
 * Generate daily market summary with structured key points
 */
export async function generateDailySummary(): Promise<DailySummaryResult | null> {
  try {
    const signals = await prisma.signal.findMany({
      where: {
        isActive: true,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      orderBy: { impactScore: 'desc' },
      take: 10,
    });

    const opportunities = signals.filter(s => s.type === 'OPPORTUNITY').length;
    const risks = signals.filter(s => s.type === 'RISK').length;
    const trends = signals.filter(s => s.type === 'TREND').length;
    const sectors = [...new Set(signals.map(s => s.sector).filter(Boolean))];

    const signalStats = { total: signals.length, opportunities, risks, trends };

    if (signals.length === 0) {
      return {
        summary: 'No significant market signals today. Markets remain stable.',
        summaryAr: 'لا توجد إشارات سوقية مهمة اليوم. الأسواق مستقرة.',
        keyPoints: [{ title: 'السوق مستقر', description: 'لم يتم رصد إشارات مهمة اليوم', impact: 'neutral' }],
        marketMood: 'neutral',
        topSectors: [],
        signalStats,
      };
    }

    const prompt = `
بناءً على الإشارات الاستثمارية التالية، اكتب ملخصاً يومياً للسوق السعودي مع نقاط رئيسية:

${signals.map(s => `- [${s.type}] ${s.titleAr}: ${s.summaryAr} (تأثير: ${s.impactScore}، قطاع: ${s.sector || 'عام'})`).join('\n')}

أعد الملخص بصيغة JSON:
{
  "summary": "English summary (150 words max)",
  "summaryAr": "الملخص بالعربية (150 كلمة كحد أقصى)",
  "keyPoints": [
    {
      "title": "عنوان النقطة بالعربية",
      "description": "شرح مختصر بالعربية",
      "impact": "positive|negative|neutral",
      "sector": "اسم القطاع (اختياري)"
    }
  ],
  "marketMood": "bullish|bearish|neutral"
}

ملاحظات:
- أضف 3-7 نقاط رئيسية تلخص أهم ما في الإشارات
- حدد مزاج السوق بناءً على نسبة الفرص للمخاطر
- اكتب كل شيء بالعربية إلا حقل summary
`;

    const response = await callOpenAI(prompt);

    if (!response) {
      // Fallback: generate structured summary from signal data directly
      const keyPoints = signals.slice(0, 5).map(s => ({
        title: s.titleAr,
        description: s.summaryAr,
        impact: (s.type === 'OPPORTUNITY' ? 'positive' : s.type === 'RISK' ? 'negative' : 'neutral') as 'positive' | 'negative' | 'neutral',
        sector: s.sector || undefined,
      }));

      return {
        summary: `Today's market shows ${signals.length} active signals with ${opportunities} opportunities and ${risks} risks identified.`,
        summaryAr: `يُظهر السوق اليوم ${signals.length} إشارات نشطة مع تحديد ${opportunities} فرص و${risks} مخاطر.`,
        keyPoints,
        marketMood: opportunities > risks ? 'bullish' : risks > opportunities ? 'bearish' : 'neutral',
        topSectors: sectors as string[],
        signalStats,
      };
    }

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || '',
          summaryAr: parsed.summaryAr || '',
          keyPoints: parsed.keyPoints || [],
          marketMood: parsed.marketMood || 'neutral',
          topSectors: sectors as string[],
          signalStats,
        };
      }
    } catch {
      logger.error('Error parsing daily summary response');
    }

    return null;
  } catch (error) {
    logger.error('Error generating daily summary:', error);
    return null;
  }
}

export default {
  analyzeDatasets,
  analyzeDataset,
  getSignalsByFilter,
  generateDailySummary,
};
