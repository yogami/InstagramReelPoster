/**
 * Content DNA Analyzer
 * 
 * Extracts psychological signals from website content:
 * - Pain Score: How well the site communicates customer problems
 * - Trust Signals: Testimonials, ratings, certifications, press mentions
 * - Urgency: Time-limited offers, scarcity language
 * 
 * Part of Phase 1: Scraping Intelligence enhancements.
 */

import { WebsiteAnalysis } from '../entities/WebsitePromo';

/**
 * Site DNA - Psychological analysis of business website.
 */
export interface SiteDNA {
    /** Pain score (0-10) - How well the site communicates customer problems */
    painScore: number;
    /** Trust signals extracted from site */
    trustSignals: string[];
    /** Urgency trigger if found */
    urgency: string | null;
    /** Confidence score for the DNA analysis (0-1) */
    confidence: number;
}

// Pain-related keywords (weighted)
const PAIN_KEYWORDS = [
    { word: 'tired', weight: 2 },
    { word: 'struggling', weight: 2 },
    { word: 'frustrated', weight: 2 },
    { word: 'problem', weight: 1.5 },
    { word: 'pain', weight: 1.5 },
    { word: 'hassle', weight: 1.5 },
    { word: 'expensive', weight: 1 },
    { word: 'slow', weight: 1 },
    { word: 'difficult', weight: 1 },
    { word: 'waiting', weight: 1 },
    { word: 'stop', weight: 0.5 },
    { word: 'solve', weight: 0.5 }
];

// Trust signal patterns
const TRUST_PATTERNS = [
    /(\d+)\+?\s*(clients?|customers?|businesses?|users?)/i,
    /(\d+\.?\d*)\s*★|★\s*(\d+\.?\d*)/i,
    /(4|5)\.(\d)\s*(stars?|rating)/i,
    /trusted by/i,
    /featured in/i,
    /as seen on/i,
    /certified|certification|ISO \d+/i,
    /award[- ]?winning/i,
    /forbes|techcrunch|wired|bloomberg/i
];

// Urgency patterns
const URGENCY_PATTERNS = [
    /limited (spots?|time|offer|availability)/i,
    /only \d+ (left|remaining|spots?|slots?)/i,
    /act now/i,
    /book (now|today)/i,
    /ends? (today|tomorrow|friday|soon)/i,
    /hurry/i,
    /don'?t miss/i,
    /exclusive offer/i
];

export class ContentDNAAnalyzer {
    /**
     * Analyzes website content for psychological conversion signals.
     */
    analyzeDNA(analysis: WebsiteAnalysis): SiteDNA {
        const content = this.extractContent(analysis);

        if (!content || content.length < 10) {
            return this.emptyDNA();
        }

        const painScore = this.calculatePainScore(content);
        const trustSignals = this.extractTrustSignals(content);
        const urgency = this.extractUrgency(content);
        const confidence = this.calculateConfidence(content, painScore, trustSignals);

        return { painScore, trustSignals, urgency, confidence };
    }

    private extractContent(analysis: WebsiteAnalysis): string {
        return [
            analysis.heroText || '',
            analysis.metaDescription || '',
            analysis.aboutContent || '',
            (analysis.keywords || []).join(' ')
        ].join(' ').toLowerCase();
    }

    private calculatePainScore(content: string): number {
        let score = 0;

        for (const { word, weight } of PAIN_KEYWORDS) {
            if (content.includes(word)) {
                score += weight;
            }
        }

        // Normalize to 0-10 scale (max raw ~15)
        return Math.min(10, Math.round(score * 10 / 15));
    }

    private extractTrustSignals(content: string): string[] {
        const signals: string[] = [];

        for (const pattern of TRUST_PATTERNS) {
            const match = content.match(pattern);
            if (match) {
                signals.push(match[0].trim());
            }
        }

        return [...new Set(signals)]; // Dedupe
    }

    private extractUrgency(content: string): string | null {
        for (const pattern of URGENCY_PATTERNS) {
            const match = content.match(pattern);
            if (match) {
                return match[0];
            }
        }
        return null;
    }

    private calculateConfidence(
        content: string,
        painScore: number,
        trustSignals: string[]
    ): number {
        // Confidence based on content richness and signal presence
        // Lower content threshold for short but signal-rich pages
        const contentScore = Math.min(1, content.length / 200);
        const signalScore = Math.min(1, (painScore / 6 + trustSignals.length / 2) / 2);

        // Boost confidence if we found strong signals even with less content
        const signalBoost = painScore >= 6 || trustSignals.length >= 2 ? 0.2 : 0;

        return Math.min(1, Math.round((contentScore * 0.3 + signalScore * 0.7 + signalBoost) * 100) / 100);
    }

    private emptyDNA(): SiteDNA {
        return {
            painScore: 0,
            trustSignals: [],
            urgency: null,
            confidence: 0
        };
    }
}
