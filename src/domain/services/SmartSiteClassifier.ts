import { NormalizedPage, SiteClassification, SiteType, PrimaryIntent } from '../entities/Intelligence';
import { PythonClassifierAdapter } from '../../infrastructure/intelligence/PythonClassifierAdapter';

export class SmartSiteClassifier {
    private pythonAdapter: PythonClassifierAdapter;
    private usePythonClassifier: boolean;

    constructor() {
        this.pythonAdapter = new PythonClassifierAdapter();
        // Toggle Python classifier - disabled in production for speed (CPU inference is slow)
        // Set USE_PYTHON_CLASSIFIER=true to enable
        this.usePythonClassifier = process.env.USE_PYTHON_CLASSIFIER === 'true';
    }

    public async classify(page: NormalizedPage): Promise<SiteClassification> {
        // 1. Try SOTA WebOrganizer Classification (if enabled)
        if (this.usePythonClassifier) {
            try {
                console.log('🧠 Invoking WebOrganizer (Python)...');
                // Combine hero text + meta for context
                const mainText = `${page.hero.headline} ${page.hero.subhead} ${page.meta.description}`;

                const result = await this.pythonAdapter.classify(mainText, {
                    contacts: page.contact
                });

                if (result.topic !== 'Unknown' && !result.error) {
                    console.log('✅ WebOrganizer Result:', result);
                    return this.mapWebOrganizerToSiteClassification(result, page);
                }
            } catch (e) {
                console.warn('⚠️ WebOrganizer failed, falling back to heuristics:', e);
            }
        } else {
            console.log('⚡ Using fast heuristic classifier (Python disabled)');
        }

        // 2. Use Fast Heuristics (default in production)
        return this.heuristicClassify(page);
    }

    private mapWebOrganizerToSiteClassification(
        result: import('../../infrastructure/intelligence/PythonClassifierAdapter').WebOrganizerResult,
        page: NormalizedPage
    ): SiteClassification {
        let type = SiteType.OTHER;
        let intent = PrimaryIntent.TRUST_PROOF;

        // MAP FORMAT FIRST (Stronger signal)
        switch (result.format) {
            case 'Ecommerce Store': type = SiteType.ECOMMERCE; break;
            case 'Portfolio': type = SiteType.PORTFOLIO; break;
            case 'Local Service': type = SiteType.LOCAL_SERVICE; break;
            case 'Blog/News': type = SiteType.BLOG; break;
            case 'Landing Page':
                // Disambiguate Landing Page based on Topic
                if (result.topic === 'Science & Technology') type = SiteType.SAAS_LANDING;
                else if (result.topic === 'Health/Medicine') type = SiteType.COURSE;
                else type = SiteType.SAAS_LANDING; // Default
                break;
        }

        // IF FORMAT UNCERTAIN, USE TOPIC MAPPING (User Request)
        if (type === SiteType.OTHER) {
            switch (result.topic) {
                case 'Science & Technology': type = SiteType.SAAS_LANDING; break;
                case 'Finance/Business': type = SiteType.ECOMMERCE; break;
                case 'Home/Hobbies': type = SiteType.LOCAL_SERVICE; break;
                case 'Health/Medicine': type = SiteType.COURSE; break;
                case 'Arts/Entertainment': type = SiteType.PORTFOLIO; break;
                case 'News/Media': type = SiteType.BLOG; break;
            }
        }

        // DETERMINE INTENT (Heuristic refinement based on page content + type)
        if (type === SiteType.ECOMMERCE) {
            intent = page.pricing.hasFreeTier ? PrimaryIntent.DEALS : PrimaryIntent.PREMIUM;
        } else if (type === SiteType.SAAS_LANDING) {
            intent = page.cta.text.toLowerCase().includes('free') ? PrimaryIntent.FAST_EASY : PrimaryIntent.TRUST_PROOF;
        } else if (type === SiteType.LOCAL_SERVICE) {
            intent = PrimaryIntent.CONTACT;
        } else if (type === SiteType.PORTFOLIO) {
            intent = PrimaryIntent.AUTHORITY;
        }

        return {
            type,
            intent,
            confidence: result.confidence || 0.8,
            reasoning: [`WebOrganizer Topic: ${result.topic}`, `WebOrganizer Format: ${result.format}`]
        };
    }

    private heuristicClassify(page: NormalizedPage): SiteClassification {
        const typeResult = this.detectType(page);
        const intentResult = this.detectIntent(page);

        return {
            type: typeResult.type,
            intent: intentResult.intent,
            confidence: (typeResult.confidence + intentResult.confidence) / 2,
            reasoning: [...typeResult.reasoning, ...intentResult.reasoning]
        };
    }

    private detectType(page: NormalizedPage): { type: SiteType; confidence: number; reasoning: string[] } {
        const text = this.aggregateText(page);
        const reasoning: string[] = [];

        // 1. Check strict overrides from existing logic
        if (page.rawAnalysis?.siteType === 'personal') {
            reasoning.push('Detected explicit "personal" site type from scraper');
            return { type: SiteType.PORTFOLIO, confidence: 0.9, reasoning };
        }

        // 2. Keyword Scoring
        const scores = {
            [SiteType.SAAS_LANDING]: this.scoreKeywords(text, ['api', 'integration', 'platform', 'software', 'dashboard', 'analytics', 'signup', 'pricing', 'features']),
            [SiteType.ECOMMERCE]: this.scoreKeywords(text, ['shop', 'cart', 'checkout', 'store', 'shipping', 'add to bag', 'sale', 'products']),
            [SiteType.LOCAL_SERVICE]: this.scoreKeywords(text, ['appointment', 'book now', 'contact us', 'visit us', 'location', 'near me', 'call']),
            [SiteType.PORTFOLIO]: this.scoreKeywords(text, ['my work', 'about me', 'projects', 'portfolio', 'resume', 'hire me', 'case studies']),
            [SiteType.COURSE]: this.scoreKeywords(text, ['learn', 'course', 'curriculum', 'enroll', 'students', 'lesson', 'masterclass']),
        };

        // 3. Structural Boosts
        if (page.pricing.hasFreeTier) {
            scores[SiteType.SAAS_LANDING] += 2;
            reasoning.push('Has Free Tier (+SAAS)');
        }
        if (page.contact.phone && page.contact.address) {
            scores[SiteType.LOCAL_SERVICE] += 2;
            reasoning.push('Has physical address/phone (+LOCAL)');
        }
        if (page.meta.title?.toLowerCase().includes('ux designer') || page.meta.title?.toLowerCase().includes('consultant')) {
            scores[SiteType.PORTFOLIO] += 3;
            reasoning.push('Title indicates individual professional (+PORTFOLIO)');
        }

        // Find max
        let bestType = SiteType.OTHER;
        let maxScore = 0;

        for (const [type, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestType = type as SiteType;
            }
        }

        reasoning.push(`Highest score: ${bestType} (${maxScore})`);

        return {
            type: bestType === SiteType.OTHER ? SiteType.SAAS_LANDING : bestType, // Default to SAAS if unsure (safe bet for business)
            confidence: Math.min(maxScore / 5, 1),
            reasoning
        };
    }

    private detectIntent(page: NormalizedPage): { intent: PrimaryIntent; confidence: number; reasoning: string[] } {
        const text = this.aggregateText(page);
        const reasoning: string[] = [];

        const scores = {
            [PrimaryIntent.FAST_EASY]: this.scoreKeywords(text, ['fast', 'easy', 'simple', 'minutes', 'instant', 'no setup', 'automated']),
            [PrimaryIntent.TRUST_PROOF]: this.scoreKeywords(text, ['trusted', 'secure', 'compliant', 'certified', 'enterprise', 'guarantee', 'proven']),
            [PrimaryIntent.PREMIUM]: this.scoreKeywords(text, ['luxury', 'exclusive', 'premium', 'high-end', 'craftsmanship', 'bespoke']),
            [PrimaryIntent.DEALS]: this.scoreKeywords(text, ['discount', 'sale', 'off', 'deal', 'limited time', 'offer', 'save']),
            [PrimaryIntent.AUTHORITY]: this.scoreKeywords(text, ['expert', 'leading', 'award-winning', 'experience', 'original', 'standard']),
        };

        let bestIntent = PrimaryIntent.FAST_EASY; // Default
        let maxScore = 0;

        for (const [intent, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestIntent = intent as PrimaryIntent;
            }
        }

        reasoning.push(`Highest intent score: ${bestIntent} (${maxScore})`);

        return {
            intent: bestIntent,
            confidence: Math.min(maxScore / 5, 1),
            reasoning
        };
    }

    private aggregateText(page: NormalizedPage): string {
        return [
            page.hero.headline,
            page.hero.subhead,
            page.meta.title,
            page.meta.description,
            page.cta.text,
            ...page.features.map(f => f.title + ' ' + f.description)
        ].join(' ').toLowerCase();
    }

    private scoreKeywords(text: string, keywords: string[]): number {
        let score = 0;
        for (const kw of keywords) {
            if (text.includes(kw)) score++;
        }
        return score;
    }
}
