/**
 * Pattern Recognition Service - خدمة التعرف على الأنماط
 * Analyzes signals over time to detect trends, cycles, anomalies, and correlations
 */

import { prisma } from './database.js';
import { logger } from '../utils/logger.js';
import { cacheGet, cacheSet } from './cache.js';

// ═══════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════

export interface Pattern {
  id: string;
  type: 'TREND' | 'CYCLE' | 'ANOMALY' | 'CORRELATION' | 'SEASONAL';
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  signals: string[];
  sectors: string[];
  timeframe: { start: string; end: string };
  metadata: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
// Helper: group signals by sector and time periods
// ═══════════════════════════════════════════════════════════════════

function groupByPeriod(signals: any[], days: number) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  return signals.filter(s => new Date(s.createdAt) >= cutoff);
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// ═══════════════════════════════════════════════════════════════════
// Main detection function
// ═══════════════════════════════════════════════════════════════════

export async function detectPatterns(): Promise<Pattern[]> {
  logger.info('Starting pattern detection...');

  const patterns: Pattern[] = [];
  let patternIndex = 0;

  try {
    // Fetch signals from last 90 days
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const signals = await prisma.signal.findMany({
      where: {
        isActive: true,
        createdAt: { gte: ninetyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    if (signals.length < 3) {
      logger.info('Not enough signals for pattern detection');
      return [];
    }

    // Group by sector
    const bySector: Record<string, typeof signals> = {};
    for (const signal of signals) {
      const sector = signal.sector || 'عام';
      if (!bySector[sector]) bySector[sector] = [];
      bySector[sector].push(signal);
    }

    // ── TREND DETECTION ──
    // Compare average impact score across 3 time periods (30-day chunks)
    const period1 = groupByPeriod(signals, 30);
    const period2 = signals.filter(s => {
      const d = new Date(s.createdAt);
      const thirtyAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const sixtyAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      return d >= sixtyAgo && d < thirtyAgo;
    });
    const period3 = signals.filter(s => {
      const d = new Date(s.createdAt);
      const sixtyAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const ninetyAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      return d >= ninetyAgo && d < sixtyAgo;
    });

    for (const [sector, sectorSignals] of Object.entries(bySector)) {
      if (sectorSignals.length < 3) continue;

      const p1 = sectorSignals.filter(s => period1.includes(s));
      const p2 = sectorSignals.filter(s => period2.includes(s));
      const p3 = sectorSignals.filter(s => period3.includes(s));

      if (p1.length > 0 && p2.length > 0 && p3.length > 0) {
        const avg1 = mean(p1.map(s => s.impactScore));
        const avg2 = mean(p2.map(s => s.impactScore));
        const avg3 = mean(p3.map(s => s.impactScore));

        // Consistent increase
        if (avg1 > avg2 && avg2 > avg3 && (avg1 - avg3) > 10) {
          patterns.push({
            id: `pattern_trend_up_${patternIndex++}`,
            type: 'TREND',
            title: `Rising Impact in ${sector}`,
            titleAr: `اتجاه تصاعدي في قطاع ${sector}`,
            description: `Impact scores in ${sector} have been consistently increasing over the past 90 days.`,
            descriptionAr: `درجات التأثير في قطاع ${sector} في ارتفاع مستمر خلال الـ 90 يوم الماضية. المتوسط الحالي ${avg1.toFixed(0)} مقارنة بـ ${avg3.toFixed(0)} قبل 3 أشهر.`,
            confidence: Math.min(95, 60 + (avg1 - avg3)),
            severity: (avg1 - avg3) > 20 ? 'high' : 'medium',
            signals: p1.slice(0, 3).map(s => s.id),
            sectors: [sector],
            timeframe: { start: ninetyDaysAgo.toISOString(), end: new Date().toISOString() },
            metadata: { avg1, avg2, avg3, signalCount: sectorSignals.length },
          });
        }

        // Consistent decrease
        if (avg1 < avg2 && avg2 < avg3 && (avg3 - avg1) > 10) {
          patterns.push({
            id: `pattern_trend_down_${patternIndex++}`,
            type: 'TREND',
            title: `Declining Impact in ${sector}`,
            titleAr: `اتجاه تنازلي في قطاع ${sector}`,
            description: `Impact scores in ${sector} have been consistently decreasing.`,
            descriptionAr: `درجات التأثير في قطاع ${sector} في انخفاض مستمر. المتوسط الحالي ${avg1.toFixed(0)} مقارنة بـ ${avg3.toFixed(0)} قبل 3 أشهر.`,
            confidence: Math.min(95, 60 + (avg3 - avg1)),
            severity: (avg3 - avg1) > 20 ? 'high' : 'medium',
            signals: p1.slice(0, 3).map(s => s.id),
            sectors: [sector],
            timeframe: { start: ninetyDaysAgo.toISOString(), end: new Date().toISOString() },
            metadata: { avg1, avg2, avg3, signalCount: sectorSignals.length },
          });
        }
      }
    }

    // ── ANOMALY DETECTION ──
    // Signals with impact score > 2 standard deviations from mean
    const allScores = signals.map(s => s.impactScore);
    const avgScore = mean(allScores);
    const sd = stdDev(allScores);

    if (sd > 0) {
      const anomalies = signals.filter(s => Math.abs(s.impactScore - avgScore) > 2 * sd);
      for (const anomaly of anomalies.slice(0, 3)) {
        const isHigh = anomaly.impactScore > avgScore;
        patterns.push({
          id: `pattern_anomaly_${patternIndex++}`,
          type: 'ANOMALY',
          title: `${isHigh ? 'Unusually High' : 'Unusually Low'} Impact: ${anomaly.titleAr}`,
          titleAr: `${isHigh ? 'تأثير مرتفع بشكل غير اعتيادي' : 'تأثير منخفض بشكل غير اعتيادي'}: ${anomaly.titleAr}`,
          description: `Signal "${anomaly.title}" has an impact score of ${anomaly.impactScore}, which is ${(Math.abs(anomaly.impactScore - avgScore) / sd).toFixed(1)} standard deviations from the mean.`,
          descriptionAr: `إشارة "${anomaly.titleAr}" بدرجة تأثير ${anomaly.impactScore}، وهي تبعد ${(Math.abs(anomaly.impactScore - avgScore) / sd).toFixed(1)} انحرافات معيارية عن المتوسط (${avgScore.toFixed(0)}).`,
          confidence: Math.min(95, 70 + Math.abs(anomaly.impactScore - avgScore) / sd * 5),
          severity: Math.abs(anomaly.impactScore - avgScore) > 3 * sd ? 'critical' : 'high',
          signals: [anomaly.id],
          sectors: anomaly.sector ? [anomaly.sector] : [],
          timeframe: { start: anomaly.createdAt.toISOString(), end: anomaly.createdAt.toISOString() },
          metadata: { score: anomaly.impactScore, mean: avgScore, stdDev: sd },
        });
      }
    }

    // ── CORRELATION DETECTION ──
    // Sectors where opportunities and risks appear together
    for (const [sector, sectorSignals] of Object.entries(bySector)) {
      const opportunities = sectorSignals.filter(s => s.type === 'OPPORTUNITY');
      const risks = sectorSignals.filter(s => s.type === 'RISK');

      if (opportunities.length >= 2 && risks.length >= 2) {
        patterns.push({
          id: `pattern_corr_${patternIndex++}`,
          type: 'CORRELATION',
          title: `Mixed Signals in ${sector}`,
          titleAr: `إشارات متضاربة في قطاع ${sector}`,
          description: `${sector} shows both ${opportunities.length} opportunities and ${risks.length} risks, suggesting market uncertainty.`,
          descriptionAr: `قطاع ${sector} يُظهر ${opportunities.length} فرص و ${risks.length} مخاطر في نفس الوقت، مما يشير إلى حالة عدم يقين في السوق.`,
          confidence: 75,
          severity: 'medium',
          signals: [...opportunities.slice(0, 2), ...risks.slice(0, 2)].map(s => s.id),
          sectors: [sector],
          timeframe: { start: ninetyDaysAgo.toISOString(), end: new Date().toISOString() },
          metadata: { opportunities: opportunities.length, risks: risks.length },
        });
      }
    }

    // ── SECTOR DOMINANCE ──
    // If one sector has significantly more signals than others
    const sectorCounts = Object.entries(bySector)
      .map(([sector, sigs]) => ({ sector, count: sigs.length }))
      .sort((a, b) => b.count - a.count);

    if (sectorCounts.length >= 2) {
      const top = sectorCounts[0];
      const second = sectorCounts[1];
      if (top.count > second.count * 2 && top.count >= 5) {
        patterns.push({
          id: `pattern_dominance_${patternIndex++}`,
          type: 'TREND',
          title: `${top.sector} Dominates Market Signals`,
          titleAr: `قطاع ${top.sector} يهيمن على إشارات السوق`,
          description: `${top.sector} has ${top.count} signals, more than double the second sector (${second.sector}: ${second.count}).`,
          descriptionAr: `قطاع ${top.sector} يمتلك ${top.count} إشارة، أكثر من ضعف القطاع الثاني (${second.sector}: ${second.count}). هذا يشير إلى تركز النشاط الاقتصادي في هذا القطاع.`,
          confidence: 90,
          severity: 'medium',
          signals: bySector[top.sector]!.slice(0, 3).map(s => s.id),
          sectors: [top.sector, second.sector],
          timeframe: { start: ninetyDaysAgo.toISOString(), end: new Date().toISOString() },
          metadata: { sectorCounts: sectorCounts.slice(0, 5) },
        });
      }
    }

    logger.info(`Pattern detection complete. Found ${patterns.length} patterns.`);
    return patterns;

  } catch (error) {
    logger.error('Error in pattern detection:', error);
    return [];
  }
}

/**
 * Get patterns with caching (1 hour)
 */
export async function getPatternsCached(): Promise<Pattern[]> {
  const cached = await cacheGet<Pattern[]>('detected_patterns');
  if (cached) return cached;

  const patterns = await detectPatterns();
  await cacheSet('detected_patterns', patterns, 3600);
  return patterns;
}

export default {
  detectPatterns,
  getPatternsCached,
};
