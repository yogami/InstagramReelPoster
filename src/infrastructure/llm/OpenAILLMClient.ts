import {
    ILLMClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
    ContentModeDetectionResult,
} from '../../domain/ports/ILLMClient';
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
    REEL_MODE_DETECTION_PROMPT,
} from './Prompts';
import { OpenAIService } from './OpenAIService';
import { ParableGenerator } from './ParableGenerator';
import { StandardReelGenerator } from './StandardReelGenerator';

// ============================================
// MAIN CLIENT CLASS
// ============================================

/**
 * OpenAI GPT-based LLM client for reel planning and content generation.
 */
export class OpenAILLMClient implements ILLMClient {
    private readonly openAIService: OpenAIService;
    private readonly parableGenerator: ParableGenerator;
    private readonly standardReelGenerator: StandardReelGenerator;

    constructor(
        apiKey: string,
        model: string = 'gpt-4.1',
        baseUrl: string = 'https://api.openai.com'
    ) {
        this.openAIService = new OpenAIService(apiKey, model, baseUrl);
        this.parableGenerator = new ParableGenerator(this.openAIService);
        this.standardReelGenerator = new StandardReelGenerator(this.openAIService);
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
            const response = await this.openAIService.chatCompletion(prompt, systemPrompt, { jsonMode: true, temperature: 0.3 });
            const parsed = this.openAIService.parseJSON<ReelModeDetectionResult & { isAnimatedMode?: boolean; reason?: string }>(response);

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
        culture?: string
    ): Promise<string[]> {
        const prompt = `You are a music curator for short-form video content.

CONTENT:
"""
${transcript.substring(0, 500)}
"""

MOOD: ${mood}
${culture ? `CULTURE HINT: ${culture}` : ''}

AVAILABLE MUSIC TAGS (pick 3-5 that best match the content):
 indian, chinese, japanese, arabic, african, latin, western, tech, modern, self-improvement, new-age, epic, motivational, uplifting, dark, calm, meditation, suspense, creative, contemplative, healing, focus, cinematic, ambient, psychedelic, classical, tribal, electronic, minimalist, spiritual, heroic, mysterious, romantic, sci-fi, alien, zen, adventure, growth, productivity

Return ONLY a JSON object: { "tags": ["tag1", "tag2", "tag3", ...] }`;

        try {
            const systemPrompt = 'You are a music curator.';
            const response = await this.openAIService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.openAIService.parseJSON<{ tags: string[] }>(response);
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

Return JSON with format: { "category": "cafe|gym|shop|service|restaurant|studio", "confidence": 0.0-1.0, "reason": "brief explanation" }`;

        try {
            const systemPrompt = 'You are a business analyst expert at categorizing local businesses.';
            const response = await this.openAIService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.openAIService.parseJSON<{ category: BusinessCategory; confidence: number; reason: string }>(response);

            console.log(`[WebsitePromo] Detected category: ${result.category} (confidence: ${result.confidence})`);
            return result.category;
        } catch (error) {
            console.error('[WebsitePromo] LLM category detection failed, using keyword fallback:', error);
            return this.fallbackCategoryDetection(analysis.keywords);
        }
    }

    /**
     * Generates a promotional reel script from website content.
     */
    async generatePromoScript(
        analysis: WebsiteAnalysis,
        category: BusinessCategory,
        template: CategoryPromptTemplate,
        businessName: string
    ): Promise<PromoScriptPlan> {
        const prompt = `Create a 17-second Instagram Reel promo script for this business:

Business: ${businessName}
Category: ${category}
Location: ${analysis.detectedLocation || 'Berlin'}
Website Description: ${analysis.metaDescription}
Hero Message: ${analysis.heroText}

Use this category-optimized template as a starting point:
- Hook (4s): "${template.hook}"
- Showcase (8s): "${template.showcase}"
- CTA (5s): "${template.cta}"
- Visual style: ${template.visuals}

Generate 3 scenes following hook→showcase→CTA structure.
Each scene needs:
- duration: seconds for this scene
- imagePrompt: Detailed image generation prompt (include style, lighting, mood)
- narration: What the voiceover says (conversational, not robotic)
- subtitle: Short text overlay
- role: "hook", "showcase", or "cta"

Also generate:
- coreMessage: One-line tagline with emoji
- musicStyle: Music mood that fits (e.g., "warm-acoustic-local")
- caption: Instagram caption with hashtags

Return JSON:
{
  "coreMessage": "Business Name: tagline with emoji",
  "scenes": [
    { "duration": 4, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "hook" },
    { "duration": 8, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "showcase" },
    { "duration": 5, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "cta" }
  ],
  "musicStyle": "...",
  "caption": "..."
}`;

        const systemPrompt = 'You are a viral Instagram Reels producer specializing in local business promos. Your content is engaging, punchy, and drives action.';
        const response = await this.openAIService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const result = this.openAIService.parseJSON<{
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
            cafe: 0, gym: 0, shop: 0, service: 0, restaurant: 0, studio: 0,
        };

        const categoryKeywords: Record<BusinessCategory, string[]> = {
            cafe: ['coffee', 'cafe', 'espresso', 'latte', 'barista'],
            gym: ['gym', 'fitness', 'training', 'workout', 'yoga'],
            shop: ['shop', 'store', 'buy', 'products', 'boutique'],
            restaurant: ['restaurant', 'dining', 'menu', 'chef', 'food'],
            studio: ['studio', 'creative', 'photography', 'art', 'design'],
            service: ['service', 'professional', 'expert', 'booking'],
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
