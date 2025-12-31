import { NormalizedPage, SiteClassification, SiteType, PrimaryIntent } from '../entities/Intelligence';
import { PythonClassifierAdapter } from '../../infrastructure/intelligence/PythonClassifierAdapter';
import { HuggingFaceClassifierClient } from '../../infrastructure/intelligence/HuggingFaceClassifierClient';
import { BeamcloudClassifierClient } from '../../infrastructure/intelligence/BeamcloudClassifierClient';

export class SmartSiteClassifier {
    private pythonAdapter: PythonClassifierAdapter;
    private huggingFaceClient: HuggingFaceClassifierClient;
    private beamcloudClient: BeamcloudClassifierClient;
    private usePythonClassifier: boolean;
    private useHuggingFace: boolean;
    private useBeamcloud: boolean;

    constructor() {
        this.pythonAdapter = new PythonClassifierAdapter();
        this.huggingFaceClient = new HuggingFaceClassifierClient();
        this.beamcloudClient = new BeamcloudClassifierClient();

        // Toggle classifiers based on available API keys
        this.usePythonClassifier = process.env.USE_PYTHON_CLASSIFIER === 'true';
        this.useHuggingFace = !!process.env.HUGGINGFACE_API_KEY;

        // Beam.cloud GPU classifier - highest accuracy, primary option
        this.useBeamcloud = !!process.env.BEAM_API_KEY && !!process.env.BEAM_CLASSIFIER_URL;
    }

    public async classify(page: NormalizedPage): Promise<SiteClassification> {
        const mainText = `${page.hero.headline} ${page.hero.subhead} ${page.meta.description} ${page.cta.text}`;
        const title = page.meta.title || '';
        const url = page.meta.originalUrl || '';

        // 1. Try Beam.cloud GPU classifier (highest accuracy, ~80-85%)
        if (this.useBeamcloud) {
            try {
                console.log('🚀 Invoking Beam.cloud GPU classifier...');
                const result = await this.beamcloudClient.classify(mainText, title, url);

                if (result.confidence > 0.3 && !result.error) {
                    console.log(`✅ Beam.cloud Result: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);
                    return this.mapClassifierResult(result, page);
                } else if (result.error) {
                    console.warn('⚠️ Beam.cloud failed:', result.error);
                }
            } catch (e) {
                console.warn('⚠️ Beam.cloud failed, falling back:', e);
            }
        }

        // 2. Try HuggingFace Inference API (fast GPU, ~70-75%)
        if (this.useHuggingFace) {
            try {
                console.log('🤗 Invoking HuggingFace Inference API...');
                const result = await this.huggingFaceClient.classify(mainText);

                // Lower threshold to 0.2 (20%) as zero-shot scores are often distributed
                if (result.confidence > 0.2 && !result.error) {
                    console.log(`✅ HuggingFace Result: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);
                    return this.mapClassifierResult(result, page);
                } else if (result.error) {
                    console.warn('⚠️ HuggingFace failed:', result.error);
                }
            } catch (e) {
                console.warn('⚠️ HuggingFace failed, falling back:', e);
            }
        }

        // 2. Try SOTA WebOrganizer (Python) if enabled
        if (this.usePythonClassifier) {
            try {
                console.log('🧠 Invoking WebOrganizer (Python)...');
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
        }

        // 3. Use Fast Heuristics (fallback)
        console.log('⚡ Using fast heuristic classifier');
        return this.heuristicClassify(page);
    }

    private mapClassifierResult(
        result: { type: string; confidence: number; allScores: Record<string, number>; model?: string },
        page: NormalizedPage
    ): SiteClassification {
        const type = (result.type as SiteType) || SiteType.SAAS_LANDING;
        const intent = this.detectIntentForType(page, type);

        return {
            type,
            intent: intent.intent,
            confidence: result.confidence,
            reasoning: [
                `GPU classifier: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`,
                `Model: ${result.model || 'bart-large-mnli'}`,
                `Scores: ${Object.entries(result.allScores).map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join(', ')}`
            ]
        };
    }

    private mapHuggingFaceToClassification(
        result: { type: string; confidence: number; allScores: Record<string, number> },
        page: NormalizedPage
    ): SiteClassification {
        const type = (result.type as SiteType) || SiteType.SAAS_LANDING;
        const intent = this.detectIntentForType(page, type);

        return {
            type,
            intent: intent.intent,
            confidence: result.confidence,
            reasoning: [
                `HuggingFace zero-shot: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`,
                `Scores: ${Object.entries(result.allScores).map(([k, v]) => `${k}=${(v * 100).toFixed(0)}%`).join(', ')}`
            ]
        };
    }

    private detectIntentForType(page: NormalizedPage, type: SiteType): { intent: PrimaryIntent } {
        // Type-based default intents
        const typeIntentDefaults: Record<SiteType, PrimaryIntent> = {
            [SiteType.PORTFOLIO]: PrimaryIntent.AUTHORITY,
            [SiteType.SAAS_LANDING]: PrimaryIntent.FAST_EASY,
            [SiteType.ECOMMERCE]: PrimaryIntent.DEALS,
            [SiteType.LOCAL_SERVICE]: PrimaryIntent.CONTACT,
            [SiteType.BLOG]: PrimaryIntent.AUTHORITY,
            [SiteType.COURSE]: PrimaryIntent.AUTHORITY,
            [SiteType.OTHER]: PrimaryIntent.TRUST_PROOF,
        };
        return { intent: typeIntentDefaults[type] || PrimaryIntent.TRUST_PROOF };
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
        const intentResult = this.detectIntent(page, typeResult.type);

        return {
            type: typeResult.type,
            intent: intentResult.intent,
            confidence: (typeResult.confidence + intentResult.confidence) / 2,
            reasoning: [...typeResult.reasoning, ...intentResult.reasoning]
        };
    }

    private detectType(page: NormalizedPage): { type: SiteType; confidence: number; reasoning: string[] } {
        const text = this.aggregateText(page);
        const url = page.meta.originalUrl?.toLowerCase() || '';
        const title = page.meta.title?.toLowerCase() || '';
        const reasoning: string[] = [];

        // Initialize scores
        const scores: Record<SiteType, number> = {
            [SiteType.PORTFOLIO]: 0,
            [SiteType.SAAS_LANDING]: 0,
            [SiteType.ECOMMERCE]: 0,
            [SiteType.LOCAL_SERVICE]: 0,
            [SiteType.BLOG]: 0,
            [SiteType.COURSE]: 0,
            [SiteType.OTHER]: 0,
        };

        // ============ PORTFOLIO DETECTION ============
        // Strong signals for personal/portfolio sites
        if (page.rawAnalysis?.siteType === 'personal') {
            scores[SiteType.PORTFOLIO] += 5;
            reasoning.push('Explicit personal site type from scraper');
        }

        // Name patterns in title: "John Doe - Developer", "Jane Smith | Designer"
        const namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+(\s*[-|–]\s*)/i;
        if (namePattern.test(page.meta.title || '')) {
            scores[SiteType.PORTFOLIO] += 4;
            reasoning.push('Personal name pattern in title');
        }

        // Personal keywords
        const portfolioKeywords = ['my work', 'my projects', 'about me', 'hire me', 'freelance', 'portfolio',
            'case study', 'case studies', 'personal site', 'resume', 'cv', 'contact me'];
        scores[SiteType.PORTFOLIO] += this.scoreKeywords(text, portfolioKeywords) * 1.5;

        // Social links with personal context (GitHub + LinkedIn = likely portfolio)
        if (page.rawAnalysis?.socialLinks?.github && page.rawAnalysis?.socialLinks?.linkedin) {
            scores[SiteType.PORTFOLIO] += 2;
            reasoning.push('Has GitHub + LinkedIn social links');
        }

        // Domain patterns for portfolios (.co, short personal domains)
        if (/^[a-z]+\.(co|me|dev|io)$/i.test(url.replace('https://', '').replace('www.', '').split('/')[0])) {
            scores[SiteType.PORTFOLIO] += 1;
        }

        // ============ SAAS/LANDING DETECTION ============
        // Domain patterns for SaaS
        if (/\.(app|io|dev|ai|cloud)$/i.test(url)) {
            scores[SiteType.SAAS_LANDING] += 2;
            reasoning.push('SaaS-typical domain extension');
        }

        // SaaS keywords
        const saasKeywords = ['api', 'sdk', 'integration', 'integrations', 'developer', 'documentation',
            'docs', 'dashboard', 'analytics', 'automate', 'automation', 'workflow', 'team', 'teams',
            'collaborate', 'collaboration', 'pricing', 'free tier', 'enterprise', 'deploy', 'deployment',
            'infrastructure', 'platform', 'cloud', 'scale', 'scalable'];
        scores[SiteType.SAAS_LANDING] += this.scoreKeywords(text, saasKeywords) * 0.8;

        // CTA patterns for SaaS
        const ctaText = page.cta.text.toLowerCase();
        if (['get started', 'start free', 'try free', 'sign up', 'request demo', 'book demo', 'start building'].some(k => ctaText.includes(k))) {
            scores[SiteType.SAAS_LANDING] += 3;
            reasoning.push('SaaS-style CTA: ' + page.cta.text);
        }

        // Has pricing with free tier
        if (page.pricing.hasFreeTier) {
            scores[SiteType.SAAS_LANDING] += 2;
            reasoning.push('Has free tier pricing');
        }

        // ============ ECOMMERCE DETECTION ============
        const ecomKeywords = ['shop', 'store', 'buy', 'cart', 'checkout', 'add to cart', 'add to bag',
            'shipping', 'delivery', 'returns', 'size guide', 'sizes', 'collection', 'new arrivals',
            'best sellers', 'sale', 'discount', '$', '€', 'product', 'products'];
        scores[SiteType.ECOMMERCE] += this.scoreKeywords(text, ecomKeywords) * 1.2;

        // E-commerce CTAs
        if (['shop now', 'buy now', 'add to cart', 'add to bag', 'view products', 'browse'].some(k => ctaText.includes(k))) {
            scores[SiteType.ECOMMERCE] += 3;
            reasoning.push('E-commerce CTA detected');
        }

        // ============ LOCAL SERVICE DETECTION ============
        // Physical presence signals
        if (page.contact.phone) {
            scores[SiteType.LOCAL_SERVICE] += 2;
            reasoning.push('Has phone number');
        }
        if (page.contact.address) {
            scores[SiteType.LOCAL_SERVICE] += 3;
            reasoning.push('Has physical address');
        }
        if (page.rawAnalysis?.openingHours) {
            scores[SiteType.LOCAL_SERVICE] += 3;
            reasoning.push('Has business hours');
        }

        // Local service keywords
        const localKeywords = ['book appointment', 'make reservation', 'visit us', 'our location',
            'locations', 'near you', 'find us', 'opening hours', 'store hours', 'clinic', 'office',
            'book now', 'reserve', 'appointment', 'consultation', 'service area', 'local'];
        scores[SiteType.LOCAL_SERVICE] += this.scoreKeywords(text, localKeywords) * 1.5;

        // German local service domains
        if (/\.de$/i.test(url) && (page.contact.phone || page.contact.address)) {
            scores[SiteType.LOCAL_SERVICE] += 2;
            reasoning.push('German domain with contact info');
        }

        // ============ BLOG DETECTION ============
        const blogKeywords = ['blog', 'article', 'articles', 'post', 'posts', 'read more', 'continue reading',
            'author', 'published', 'written by', 'tags', 'categories', 'archive', 'latest posts',
            'recent articles', 'newsletter', 'subscribe'];
        scores[SiteType.BLOG] += this.scoreKeywords(text, blogKeywords) * 1.5;

        // Blog-like title patterns
        if (/(magazine|journal|digest|times|post|tribune|blog)/i.test(title)) {
            scores[SiteType.BLOG] += 3;
            reasoning.push('Blog/magazine name pattern');
        }

        // ============ COURSE DETECTION ============
        const courseKeywords = ['course', 'courses', 'learn', 'tutorial', 'tutorials', 'lesson', 'lessons',
            'curriculum', 'enroll', 'enrollment', 'student', 'students', 'instructor', 'certificate',
            'certification', 'masterclass', 'bootcamp', 'training', 'workshop'];
        scores[SiteType.COURSE] += this.scoreKeywords(text, courseKeywords) * 1.2;

        // ============ DETERMINE WINNER ============
        let bestType = SiteType.OTHER;
        let maxScore = 0;

        for (const [type, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestType = type as SiteType;
            }
        }

        // Log all scores for debugging
        reasoning.push(`Scores: PORTFOLIO=${scores[SiteType.PORTFOLIO].toFixed(1)}, SAAS=${scores[SiteType.SAAS_LANDING].toFixed(1)}, ECOM=${scores[SiteType.ECOMMERCE].toFixed(1)}, LOCAL=${scores[SiteType.LOCAL_SERVICE].toFixed(1)}, BLOG=${scores[SiteType.BLOG].toFixed(1)}, COURSE=${scores[SiteType.COURSE].toFixed(1)}`);

        // If score is too low, default based on context
        if (maxScore < 2) {
            // Fallback logic based on weak signals
            if (page.contact.email && !page.contact.phone) {
                bestType = SiteType.SAAS_LANDING; // Likely tech company
            } else if (page.contact.phone) {
                bestType = SiteType.LOCAL_SERVICE; // Has phone = local
            } else {
                bestType = SiteType.SAAS_LANDING; // Safe default for business
            }
            reasoning.push(`Low confidence fallback to ${bestType}`);
        }

        return {
            type: bestType,
            confidence: Math.min(maxScore / 8, 1), // Normalize to 0-1
            reasoning
        };
    }

    private detectIntent(page: NormalizedPage, siteType: SiteType): { intent: PrimaryIntent; confidence: number; reasoning: string[] } {
        const text = this.aggregateText(page);
        const reasoning: string[] = [];

        // Type-based default intents
        const typeIntentDefaults: Record<SiteType, PrimaryIntent> = {
            [SiteType.PORTFOLIO]: PrimaryIntent.AUTHORITY,
            [SiteType.SAAS_LANDING]: PrimaryIntent.FAST_EASY,
            [SiteType.ECOMMERCE]: PrimaryIntent.DEALS,
            [SiteType.LOCAL_SERVICE]: PrimaryIntent.CONTACT,
            [SiteType.BLOG]: PrimaryIntent.AUTHORITY,
            [SiteType.COURSE]: PrimaryIntent.AUTHORITY,
            [SiteType.OTHER]: PrimaryIntent.TRUST_PROOF,
        };

        const scores = {
            [PrimaryIntent.FAST_EASY]: this.scoreKeywords(text, ['fast', 'easy', 'simple', 'minutes', 'instant', 'no setup', 'automated', 'quick']),
            [PrimaryIntent.TRUST_PROOF]: this.scoreKeywords(text, ['trusted', 'secure', 'compliant', 'certified', 'enterprise', 'guarantee', 'proven', 'reliable']),
            [PrimaryIntent.PREMIUM]: this.scoreKeywords(text, ['luxury', 'exclusive', 'premium', 'high-end', 'craftsmanship', 'bespoke', 'handmade']),
            [PrimaryIntent.DEALS]: this.scoreKeywords(text, ['discount', 'sale', 'off', 'deal', 'limited time', 'offer', 'save', 'free shipping']),
            [PrimaryIntent.AUTHORITY]: this.scoreKeywords(text, ['expert', 'leading', 'award', 'experience', 'years', 'professional', 'specialist']),
            [PrimaryIntent.CONTACT]: this.scoreKeywords(text, ['contact', 'call', 'visit', 'book', 'appointment', 'consultation']),
        };

        let bestIntent = typeIntentDefaults[siteType];
        let maxScore = 0;

        for (const [intent, score] of Object.entries(scores)) {
            if (score > maxScore) {
                maxScore = score;
                bestIntent = intent as PrimaryIntent;
            }
        }

        // If no strong signal, use type default
        if (maxScore < 2) {
            bestIntent = typeIntentDefaults[siteType];
            reasoning.push(`Using type-default intent: ${bestIntent}`);
        } else {
            reasoning.push(`Detected intent: ${bestIntent} (score: ${maxScore})`);
        }

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
