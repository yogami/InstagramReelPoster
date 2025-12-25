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
}
