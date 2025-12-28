import {
    WebsiteAnalysis,
    SiteDNA,
} from '../../domain/entities/WebsitePromo';

/**
 * Analyzes website content to extract psychological Site DNA.
 * Calculates painScore, extracts trustSignals, and detects urgency triggers.
 */
export class SemanticAnalyzer {
    private readonly painPhrases: RegExp[];
    private readonly urgencyPatterns: RegExp[];

    constructor() {
        this.painPhrases = [
            /frustrated\s+with/i,
            /tired\s+of/i,
            /struggling\s+to/i,
            /sick\s+of/i,
            /fed\s+up/i,
            /wasting\s+(time|money)/i,
            /losing\s+(time|money|customers?)/i,
            /can't\s+seem\s+to/i,
            /problem/i,
            /challenge/i,
            /difficult/i,
            /pain\s+point/i,
        ];

        this.urgencyPatterns = [
            /limited\s+(spots?|availability|time|offer)/i,
            /book\s+now/i,
            /act\s+(fast|now|quickly)/i,
            /only\s+\d+\s+(left|remaining|spots?)/i,
            /offer\s+ends/i,
            /last\s+chance/i,
            /don'?t\s+miss/i,
            /hurry/i,
            /while\s+(supplies|stock)\s+last/i,
            /ending\s+soon/i,
            /limited\s+time/i,
        ];
    }

    /**
     * Analyzes full website content to produce Site DNA.
     */
    analyzeSiteDNA(analysis: WebsiteAnalysis): SiteDNA {
        const painScore = this.calculatePainScore(analysis);
        const trustSignals = this.extractTrustSignals(analysis);
        const urgency = this.detectUrgency(analysis);
        const confidence = this.calculateConfidence(analysis);

        return {
            painScore,
            trustSignals,
            urgency,
            confidence,
        };
    }

    /**
     * Calculates pain score (0-10) based on pain point indicators.
     */
    private calculatePainScore(analysis: WebsiteAnalysis): number {
        let score = 0;

        const textToAnalyze = this.getAllText(analysis);

        for (const phrase of this.painPhrases) {
            const matches = textToAnalyze.match(phrase);
            if (matches) {
                score += 2;
            }
        }

        if (analysis.pricingContent?.painPoints) {
            score += analysis.pricingContent.painPoints.length;
        }

        if (analysis.testimonialsContent?.quotes) {
            for (const quote of analysis.testimonialsContent.quotes) {
                if (this.containsPainPhrase(quote)) {
                    score += 3;
                }
            }
        }

        return Math.min(10, Math.max(0, score));
    }

    /**
     * Extracts trust signals from testimonials and site content.
     */
    private extractTrustSignals(analysis: WebsiteAnalysis): string[] {
        const signals: string[] = [];

        if (analysis.testimonialsContent) {
            const { starRatings, clientCounts, pressMentions } = analysis.testimonialsContent;

            if (starRatings) {
                signals.push(...starRatings);
            }
            if (clientCounts) {
                signals.push(...clientCounts);
            }
            if (pressMentions) {
                signals.push(...pressMentions);
            }
        }

        const textToSearch = this.getAllText(analysis);

        const ratingPattern = new RegExp('(\\d+(?:\\.\\d+)?)\\s*(?:out\\s*of\\s*)?[/]?\\s*5\\s*(stars?)?', 'gi');
        const clientPattern = /(\d+\+?)\s*(clients?|customers?|users?|satisfied|happy)/gi;
        const pressPattern = /(featured\s+in|as\s+seen\s+on)\s+(\w+)/gi;

        let match;
        while ((match = ratingPattern.exec(textToSearch)) !== null) {
            const signal = match[0].trim();
            if (!signals.includes(signal)) {
                signals.push(signal);
            }
        }

        while ((match = clientPattern.exec(textToSearch)) !== null) {
            const signal = match[0].trim();
            if (!signals.includes(signal)) {
                signals.push(signal);
            }
        }

        while ((match = pressPattern.exec(textToSearch)) !== null) {
            const signal = match[0].trim();
            if (!signals.includes(signal)) {
                signals.push(signal);
            }
        }

        return signals;
    }

    /**
     * Detects urgency triggers in site content.
     */
    private detectUrgency(analysis: WebsiteAnalysis): string | null {
        const textToSearch = this.getAllText(analysis);

        for (const pattern of this.urgencyPatterns) {
            const match = textToSearch.match(pattern);
            if (match) {
                return match[0];
            }
        }

        return null;
    }

    /**
     * Calculates confidence score based on data richness.
     */
    private calculateConfidence(analysis: WebsiteAnalysis): number {
        let confidence = 0.2;

        if (analysis.heroText && analysis.heroText.length > 10) {
            confidence += 0.1;
        }
        if (analysis.metaDescription && analysis.metaDescription.length > 20) {
            confidence += 0.1;
        }
        if (analysis.aboutContent && analysis.aboutContent.length > 50) {
            confidence += 0.15;
        }
        if (analysis.pricingContent) {
            confidence += 0.15;
        }
        if (analysis.testimonialsContent) {
            confidence += 0.2;
            if (analysis.testimonialsContent.quotes.length > 0) {
                confidence += 0.1;
            }
        }

        return Math.min(1, confidence);
    }

    /**
     * Combines all available text for analysis.
     */
    private getAllText(analysis: WebsiteAnalysis): string {
        const parts: string[] = [
            analysis.heroText,
            analysis.metaDescription,
            analysis.aboutContent || '',
            analysis.pricingContent?.rawText || '',
        ];

        if (analysis.testimonialsContent?.quotes) {
            parts.push(...analysis.testimonialsContent.quotes);
        }

        return parts.join(' ').toLowerCase();
    }

    /**
     * Checks if text contains any pain phrases.
     */
    private containsPainPhrase(text: string): boolean {
        const lowerText = text.toLowerCase();
        return this.painPhrases.some(phrase => phrase.test(lowerText));
    }
}
