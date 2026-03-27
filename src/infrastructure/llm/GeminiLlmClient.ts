
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
    PromoScriptPlan,
    PromoSceneContent,
} from '../../domain/entities/WebsitePromo';
import {
    getRandomViralHook,
    CATEGORY_PROMPTS,
} from './CategoryPrompts';
import {
    REEL_MODE_DETECTION_PROMPT,
    GENERATE_RESTAURANT_SCRIPT_PROMPT,
} from './Prompts';
import { GeminiService } from './GeminiService';
import { ParableGenerator } from './ParableGenerator';
import { StandardReelGenerator } from './StandardReelGenerator';
import { buildPersonalPromoPrompt, parsePersonalPromoResponse } from './PersonalPromoPrompt';
import { buildBlueprintPrompt, parseBlueprintResponse } from './BlueprintPrompt';

/**
 * Gemini-based LLM client for reel planning and content generation.
 */
export class GeminiLlmClient implements ILlmClient {
    public readonly llmService: GeminiService;
    private readonly parableGenerator: ParableGenerator;
    private readonly standardReelGenerator: StandardReelGenerator;

    constructor(
        apiKey: string,
        model: string = 'gemini-2.0-flash'
    ) {
        this.llmService = new GeminiService(apiKey, model);
        this.parableGenerator = new ParableGenerator(this.llmService);
        this.standardReelGenerator = new StandardReelGenerator(this.llmService);
    }

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
            const parsed = this.llmService.parseJSON<ReelModeDetectionResult>(response);

            return {
                isAnimatedMode: parsed.isAnimatedMode ?? false,
                storyline: parsed.storyline,
                reason: parsed.reason ?? 'Detection completed',
            };
        } catch (error) {
            console.warn('[GeminiLLM] Reel mode detection failed:', error);
            return {
                isAnimatedMode: false,
                reason: 'Detection failed, defaulting to image-based reel',
            };
        }
    }

    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        return this.standardReelGenerator.planReel(transcript, constraints);
    }

    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        return this.standardReelGenerator.generateSegmentContent(plan, transcript);
    }

    async adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]> {
        return this.standardReelGenerator.adjustCommentaryLength(segments, direction, targetDurationSeconds);
    }

    async generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]> {
        return this.standardReelGenerator.generateHooks(transcript, plan, trendContext);
    }

    async generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags> {
        return this.standardReelGenerator.generateCaptionAndTags(fullScript, summary);
    }

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

    async selectMusicTags(
        transcript: string,
        mood: string,
        culture?: string,
        context?: string
    ): Promise<string[]> {
        const prompt = `You are a music curator for short-form video content.
Pick 3-5 music tags that best match the content.
AVAILABLE TAGS: indian, chinese, japanese, arabic, african, latin, western, tech, modern, self-improvement, new-age, epic, motivational, uplifting, dark, calm, meditation, suspense, creative, contemplative, healing, focus, cinematic, ambient, psychedelic, classical, tribal, electronic, minimalist, spiritual, heroic, mysterious, romantic, sci-fi, alien, zen, adventure, growth, productivity, upbeat, corporate, business, professional, lifestyle, trendy, pop

Return ONLY a JSON object: { "tags": ["tag1", "tag2", ...] }`;

        try {
            const systemPrompt = 'You are a music curator.';
            const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.llmService.parseJSON<{ tags: string[] }>(response);
            return result.tags || ['meditation', 'calm', 'ambient'];
        } catch (error) {
            console.error('[GeminiLLM] Failed to select music tags:', error);
            return ['ambient', 'meditation'];
        }
    }

    async detectBusinessCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory> {
        const prompt = `Analyze this business website and determine its primary category.
Hero: ${analysis.heroText}
Description: ${analysis.metaDescription}

Categories: cafe, gym, shop, service, restaurant, studio, tech, agency

Return JSON: { "category": "...", "confidence": 0.0-1.0, "reason": "..." }`;

        try {
            const systemPrompt = 'You are a business analyst.';
            const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
            const result = this.llmService.parseJSON<{ category: BusinessCategory }>(response);
            return result.category;
        } catch (error) {
            console.error('[GeminiLLM] Category detection failed:', error);
            return 'service';
        }
    }

    async generatePromoScript(
        analysis: WebsiteAnalysis,
        category: BusinessCategory,
        language: string = 'en',
        options?: { formality?: 'formal' | 'informal'; tone?: string }
    ): Promise<PromoScriptPlan> {
        const viralHook = getRandomViralHook();
        const businessName = analysis.detectedBusinessName || 'the business';

        let prompt = '';
        if (category === 'restaurant') {
            prompt = GENERATE_RESTAURANT_SCRIPT_PROMPT
                .replace(/{{businessName}}/g, businessName)
                .replace(/{{language}}/g, language);
        } else {
            prompt = `Create a 17-second Instagram Reel promo script for "${businessName}".
Category: ${category}
Strategy: ${viralHook.name}

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

        const systemPrompt = 'You are a creative director.';
        const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const result = this.llmService.parseJSON<any>(response);

        return {
            ...result,
            category,
            businessName,
            language,
            hookType: viralHook.id,
            compliance: {
                source: 'public-website',
                consent: true,
                scrapedAt: new Date(),
            },
        };
    }

    async generatePersonalPromoScript(
        analysis: WebsiteAnalysis,
        language: string = 'en'
    ): Promise<PromoScriptPlan> {
        const personalName = analysis.personalInfo?.fullName || 'the professional';
        const prompt = buildPersonalPromoPrompt(analysis, personalName, language);
        const systemPrompt = 'You are an expert personal brand strategist.';

        const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const result = parsePersonalPromoResponse(response);

        return {
            ...result,
            language,
            compliance: {
                source: 'public-website',
                consent: true,
                scrapedAt: new Date(),
            }
        };
    }

    async generateScriptFromBlueprint(
        blueprint: any,
        language?: string
    ): Promise<PromoScriptPlan> {
        const prompt = buildBlueprintPrompt(blueprint, language);
        const systemPrompt = "You are a specialized video scriptwriter.";

        const response = await this.llmService.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const result = parseBlueprintResponse(response, blueprint);
        return result;
    }

    async generateText(prompt: string): Promise<string> {
        return this.llmService.chatCompletion(prompt, 'You are a helpful assistant.');
    }
}
