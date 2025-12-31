import {
    ILlmClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
    ContentModeDetectionResult,
} from '../../domain/ports/ILlmClient';
import { CaptionAndTags } from '../../domain/entities/Growth';
import {
    ParableIntent,
    ParableSourceChoice,
    ParableScriptPlan,
} from '../../domain/entities/Parable';
import {
    BusinessCategory,
    WebsiteAnalysis,
    CategoryPromptTemplate,
    PromoScriptPlan,
    PromoSceneContent,
} from '../../domain/entities/WebsitePromo';
import {
    getPromptTemplate,
    detectCategoryFromKeywords,
    getMusicStyle,
    getRandomViralHook,
} from './CategoryPrompts';
import {
    REEL_MODE_DETECTION_PROMPT,
    GENERATE_RESTAURANT_SCRIPT_PROMPT,
} from './Prompts';
import { GptService } from './GptService';
import { ParableGenerator } from './ParableGenerator';
import { StandardReelGenerator } from './StandardReelGenerator';

// ============================================
// MAIN CLIENT CLASS
// ============================================

/**
 * GPT-based LLM client for reel planning and content generation.
 */
export class GptLlmClient implements ILlmClient {
    private readonly llmService: GptService;
    private readonly parableGenerator: ParableGenerator;
    private readonly standardReelGenerator: StandardReelGenerator;

    constructor(
        apiKey: string,
        model: string = 'gpt-4.1',
        baseUrl: string = 'https://api.openai.com/v1'
    ) {
        this.llmService = new GptService(apiKey, model, baseUrl);
        this.parableGenerator = new ParableGenerator(this.llmService);
        this.standardReelGenerator = new StandardReelGenerator(this.llmService);
    }

    /**
     * Detects whether the user wants an animated video reel based on their transcript.
     * Uses LLM to interpret natural language intent.
     */
    async detectReelMode(transcript: string): Promise<ReelModeDetectionResult> {
        if (!transcript || transcript.trim().length === 0) {
            return {
                isAnimatedMode: false,
                reason: 'Empty transcript defaults to image-based reel',
            };
        }

        const prompt = REEL_MODE_DETECTION_PROMPT.replace('{{transcript}}', transcript);

        try {
            const systemPrompt = 'You are an intent detection assistant. Analyze user input and return structured JSON responses. Be precise and factual.';
            const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true, temperature: 0.3 });
            const parsed = this.llmService.parseJSON<ReelModeDetectionResult & { isAnimatedMode?: boolean; reason?: string }>(response);

            console.log(`[LLM] Reel mode detection: ${parsed.isAnimatedMode ? 'ANIMATED' : 'IMAGES'} - ${parsed.reason}`);

            return {
                isAnimatedMode: parsed.isAnimatedMode ?? false,
                storyline: parsed.storyline,
                reason: parsed.reason ?? 'Detection completed',
            };
        } catch (error) {
            console.warn('[LLM] Reel mode detection failed, defaulting to image mode:', error);
            return {
                isAnimatedMode: false,
                reason: 'Detection failed, defaulting to image-based reel',
            };
        }
    }

    /**
     * Plans the structure of a reel based on the transcript.
     */
    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        return this.standardReelGenerator.planReel(transcript, constraints);
    }

    /**
     * Generates commentary and image prompts for each segment.
     */
    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        return this.standardReelGenerator.generateSegmentContent(plan, transcript);
    }

    /**
     * Adjusts commentary length to better match target duration.
     */
    async adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]> {
        return this.standardReelGenerator.adjustCommentaryLength(segments, direction, targetDurationSeconds);
    }

    /**
     * Generates multiple hook options for the reel.
     */
    async generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]> {
        return this.standardReelGenerator.generateHooks(transcript, plan, trendContext);
    }

    /**
     * Generates an expanded caption and hashtags optimized for virality.
     */
    async generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags> {
        return this.standardReelGenerator.generateCaptionAndTags(fullScript, summary);
    }

    // ============================================
    // PARABLE MODE METHODS (Delegated)
    // ============================================

    async detectContentMode(transcript: string): Promise<ContentModeDetectionResult> {
        return this.parableGenerator.detectContentMode(transcript);
    }

    async extractParableIntent(transcript: string): Promise<ParableIntent> {
        return this.parableGenerator.extractParableIntent(transcript);
    }

    async chooseParableSource(intent: ParableIntent): Promise<ParableSourceChoice> {
        return this.parableGenerator.chooseParableSource(intent);
    }

    async generateParableScript(
        intent: ParableIntent,
        sourceChoice: ParableSourceChoice,
        targetDurationSeconds: number
    ): Promise<ParableScriptPlan> {
        return this.parableGenerator.generateParableScript(intent, sourceChoice, targetDurationSeconds);
    }

    async generateParableHooks(
        parableScript: ParableScriptPlan,
        trendContext?: string
    ): Promise<string[]> {
        return this.parableGenerator.generateParableHooks(parableScript, trendContext);
    }

    async generateParableCaptionAndTags(
        parableScript: ParableScriptPlan,
        summary: string
    ): Promise<CaptionAndTags> {
        return this.parableGenerator.generateParableCaptionAndTags(parableScript, summary);
    }

    /**
     * Selects music tags based on content analysis.
     */
    async selectMusicTags(
        transcript: string,
        mood: string,
        culture?: string,
        context?: string
    ): Promise<string[]> {
        const prompt = `You are a music curator for short-form video content.

CONTENT/CONTEXT:
"""
${context || ''}
${transcript.substring(0, 500)}
"""

MOOD: ${mood}
${culture ? `CULTURE HINT: ${culture}` : ''}

AVAILABLE MUSIC TAGS (pick 3-5 that best match the content):
 indian, chinese, japanese, arabic, african, latin, western, tech, modern, self-improvement, new-age, epic, motivational, uplifting, dark, calm, meditation, suspense, creative, contemplative, healing, focus, cinematic, ambient, psychedelic, classical, tribal, electronic, minimalist, spiritual, heroic, mysterious, romantic, sci-fi, alien, zen, adventure, growth, productivity, upbeat, corporate, business, professional, lifestyle, trendy, pop

Return ONLY a JSON object: { "tags": ["tag1", "tag2", "tag3", ...] }`;

        try {
            const systemPrompt = 'You are a music curator.';
            const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.llmService.parseJSON<{ tags: string[] }>(response);
            return result.tags || ['meditation', 'calm', 'ambient'];
        } catch (error) {
            console.error('Failed to select music tags via LLM:', error);
            return this.fallbackMusicTags(mood, culture);
        }
    }

    private fallbackMusicTags(mood: string, culture?: string): string[] {
        const tags: string[] = [];
        this.addCultureMusicTags(tags, culture);
        this.addMoodMusicTags(tags, mood);

        if (tags.length === 0) {
            tags.push('ambient', 'meditation');
        }

        return Array.from(new Set(tags)).slice(0, 5);
    }

    private addCultureMusicTags(tags: string[], culture?: string): void {
        if (!culture) return;
        const lowerCulture = culture.toLowerCase();
        if (lowerCulture.includes('india')) tags.push('indian', 'spiritual');
        if (lowerCulture.includes('china') || lowerCulture.includes('chines')) tags.push('chinese', 'asian');
        if (lowerCulture.includes('japan')) tags.push('japanese', 'zen');
        if (lowerCulture.includes('arab')) tags.push('arabic', 'middle-eastern');
        if (lowerCulture.includes('africa')) tags.push('african', 'tribal');
    }

    private addMoodMusicTags(tags: string[], mood: string): void {
        const lowerMood = mood.toLowerCase();
        if (lowerMood.includes('epic') || lowerMood.includes('heroic')) tags.push('epic', 'cinematic');
        if (lowerMood.includes('dark') || lowerMood.includes('suspense')) tags.push('dark', 'suspense');
        if (lowerMood.includes('calm') || lowerMood.includes('peaceful')) tags.push('meditation', 'calm');
        if (lowerMood.includes('motivat') || lowerMood.includes('inspir')) tags.push('uplifting', 'motivational');
    }

    // ============================================
    // WEBSITE PROMO MODE METHODS
    // ============================================

    /**
     * Detects business category from scraped website content using LLM.
     */
    async detectBusinessCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory> {
        const prompt = `Analyze this business website and determine its primary category.

Website Content:
- Hero/Title: ${analysis.heroText}
- Description: ${analysis.metaDescription}
- Keywords found: ${analysis.keywords.join(', ')}
- Location: ${analysis.detectedLocation || 'Unknown'}

Categories to choose from:
- cafe: Coffee shops, bakeries, tea houses
- gym: Fitness centers, yoga studios, CrossFit boxes
- shop: Retail stores, boutiques, gift shops
- service: Professional services (plumbers, consultants, therapists)
- restaurant: Restaurants, bistros, bars, dining establishments  
- studio: Creative studios (photography, art, music, tattoo, dance)
- tech: Software, AI, SaaS, digital platforms, IT services
- agency: Marketing, design, consulting, strategy agencies

Return JSON with format: { "category": "cafe|gym|shop|service|restaurant|studio|spiritual|tech|agency", "confidence": 0.0-1.0, "reason": "brief explanation" }`;

        try {
            const systemPrompt = 'You are a business analyst expert at categorizing local businesses.';
            const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.llmService.parseJSON<{ category: BusinessCategory; confidence: number; reason: string }>(response);

            console.log(`[WebsitePromo] Detected category: ${result.category} (confidence: ${result.confidence})`);
            return result.category;
        } catch (error) {
            console.error('[WebsitePromo] LLM category detection failed, using keyword fallback:', error);
            return this.fallbackCategoryDetection(analysis.keywords);
        }
    }

    /**
     * Generates a promotional reel script from website content using a Truth-First cultural approach.
     */
    async generatePromoScript(
        analysis: WebsiteAnalysis,
        category: BusinessCategory,
        template: CategoryPromptTemplate,
        businessName: string,
        language: string
    ): Promise<PromoScriptPlan> {
        const langMap: Record<string, string> = {
            'en': 'English (Expat/International Berlin style)',
            'de': 'German (Local Berlin/Berliner Schnauze style)'
        };
        const targetLanguage = langMap[language] || 'English';

        // Cultural Voice Definition
        const culturalVoice = language === 'de'
            ? `VOICE: "Berliner Schnauze" - Direct, honest, zero-fluff, slightly dry/witty, and professional but grounded. Avoid "hype" marketing. Be neighborly and straightforward.`
            : `VOICE: "International Berlin" - Sophisticated, creative, edgy, high-standards, sharp but friendly. Avoid "American-style hype" or "fake energy". Focus on the "why" and authentic value.`;

        // Build Site DNA context for the prompt
        const siteDNA = analysis.siteDNA;
        const siteDNAContext = siteDNA ? `
SITE DNA ANALYSIS:
- Pain Score: ${siteDNA.painScore}/10 ${siteDNA.painScore >= 7 ? '(Customer has a deep wound - address it truthfully)' : '(Focus on the aspirational shift)'}
- Trust Signals: ${siteDNA.trustSignals.length > 0 ? siteDNA.trustSignals.slice(0, 3).join(', ') : 'Rely on authentic voice'}
- Urgency: ${siteDNA.urgency || 'None detected'}
${analysis.testimonialsContent?.quotes?.length ? `- Authentic Feedback: "${analysis.testimonialsContent.quotes[0]}"` : ''}
` : '';

        const systemPrompt = `You are a high-end creative director designing non-cliché Instagram promos for Berlin-based businesses.
        
${culturalVoice}

STYLE RULES:
1. NO COOKIE-CUTTER HOOKS: Avoid "Struggling with X?" or "Are you tired of Y?".
2. TRUTH-FIRST: Call out a reality or an industry lie that the business solves.
3. NO HYPE: Avoid words like "unbelievable," "amazing," "one-of-a-kind," or "game changer."
4. FOCUS ON THE "WHY": Why does this business exist in the neighborhood? What is the soul of the work?
5. SHOW, DON'T SELL: Describe results and vibe over sales features.`;

        // Select a viral hook strategy
        const viralHook = getRandomViralHook();
        const hookInstruction = `virality_strategy: ${viralHook.name} (${viralHook.description})`;

        let prompt = '';

        if (category === 'restaurant') {
            prompt = GENERATE_RESTAURANT_SCRIPT_PROMPT
                .replace(/{{businessName}}/g, businessName)
                .replace('{{signatureDish}}', analysis.signatureDish || "Chef's Special")
                .replace('{{rating}}', analysis.rating || "4.8⭐")
                .replace('{{reviewCount}}', (analysis.reviewCount || 100).toString())
                .replace('{{address}}', analysis.address || "Berlin")
                .replace('{{reservationLink}}', analysis.reservationLink || "Link in Bio")
                .replace('{{deliveryInfo}}', analysis.deliveryLinks?.map(l => l.platform).join(', ') || "Available")
                .replace('{{highlights}}', analysis.keywords.join(', '))
                .replace(/{{language}}/g, targetLanguage);
        } else {
            prompt = `Create a 17-second Instagram Reel promo script for "${businessName}".
        
CRITICAL: The script (narration, caption, coreMessage) MUST be in ${targetLanguage}.

BUSINESS CONTEXT (THE ONLY SOURCE OF TRUTH):
- Category: ${category}
- Location: ${analysis.detectedLocation || 'Berlin'}
- Website Description: ${analysis.metaDescription}
- Hero Message: ${analysis.heroText}
- CONTACT INFO: Address: ${analysis.address || 'N/A'}, Phone: ${analysis.phone || 'N/A'}, Email: ${analysis.email || 'N/A'}, Hours: ${analysis.openingHours || 'N/A'}
${siteDNAContext}

INSPIRATION (Use these themes but REWRITE with the ${culturalVoice}):
- Core Themes: ${template.showcase}
- Desired Visual Sentiment: ${template.visuals}
- **VIRAL STRATEGY**: ${hookInstruction}

STRUCTURE (17s Total):
${viralHook.structureInstruction}
   - VISUAL INSTRUCTION: ${viralHook.visualInstruction}
2. THE SOUL (8s): Show the craftsmanship or the solved reality. Use the Site DNA.
3. THE DIRECT CTA (5s): A clear, non-pushy invitation.
   - VISUAL INSTRUCTION: The image prompt for this scene MUST describe a clean, uncluttered background (e.g., negative space, blurred background, or clean wall). 
   - **CRITICAL**: DO NOT include any text, phone numbers, email addresses, or business names in the \`imagePrompt\`. All text will be added as a technical overlay. Any text in the image will be considered a FAILURE.

Each scene needs:
- duration: seconds for this scene (Target 17s total)
- imagePrompt: Detailed Midjourney-style prompt (English)
- narration: Spoken text (in ${targetLanguage})
- subtitle: Short text overlay (in ${targetLanguage})
- role: "hook", "showcase", or "cta"

Also generate:
- coreMessage: One-line tag (in ${targetLanguage})
- musicStyle: Mood for the track (English)
- caption: Instagram caption including 3 context-aware hashtags (in ${targetLanguage})

Return JSON:
{
  "coreMessage": "...",
  "scenes": [
    { "duration": 4, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "hook" },
    { "duration": 8, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "showcase" },
    { "duration": 5, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "cta" }
  ],
  "musicStyle": "...",
  "caption": "..."
}`;
        }

        const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const result = this.llmService.parseJSON<{
            coreMessage: string;
            scenes: PromoSceneContent[];
            musicStyle: string;
            caption: string;
        }>(response);

        return {
            coreMessage: result.coreMessage,
            category,
            businessName,
            scenes: result.scenes,
            musicStyle: result.musicStyle,
            caption: result.caption,
            language,
            hookType: viralHook.id,
            compliance: {
                source: 'public-website',
                consent: true,
                scrapedAt: new Date(),
            },
        };
    }

    /**
     * Fallback category detection using keywords.
     */
    private fallbackCategoryDetection(keywords: string[]): BusinessCategory {
        const normalizedKeywords = keywords.map(kw => kw.toLowerCase());

        const categoryScores: Record<BusinessCategory, number> = {
            cafe: 0, gym: 0, shop: 0, service: 0, restaurant: 0, studio: 0, spiritual: 0, tech: 0, agency: 0,
        };

        const categoryKeywords: Record<BusinessCategory, string[]> = {
            cafe: ['coffee', 'cafe', 'espresso', 'latte', 'barista'],
            gym: ['gym', 'fitness', 'training', 'workout', 'yoga'],
            shop: ['shop', 'store', 'buy', 'products', 'boutique'],
            restaurant: ['restaurant', 'dining', 'menu', 'chef', 'food'],
            studio: ['studio', 'creative', 'photography', 'art', 'design'],
            service: ['service', 'professional', 'expert', 'booking'],
            spiritual: ['meditation', 'spirituality', 'insight', 'healing'],
            tech: ['software', 'app', 'ai', 'data', 'cloud', 'tech'],
            agency: ['agency', 'marketing', 'strategy', 'branding'],
        };

        for (const [cat, catKeywords] of Object.entries(categoryKeywords)) {
            for (const kw of catKeywords) {
                if (normalizedKeywords.includes(kw)) {
                    categoryScores[cat as BusinessCategory]++;
                }
            }
        }

        let bestCategory: BusinessCategory = 'service';
        let bestScore = 0;
        for (const [cat, score] of Object.entries(categoryScores)) {
            if (score > bestScore) {
                bestScore = score;
                bestCategory = cat as BusinessCategory;
            }
        }

        return bestCategory;
    }
}
