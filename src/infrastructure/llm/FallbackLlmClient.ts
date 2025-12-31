import { ILlmClient, ReelPlan, SegmentContent, PlanningConstraints, ReelModeDetectionResult, ContentModeDetectionResult } from '../../domain/ports/ILlmClient';
import { HookPlan, CaptionAndTags } from '../../domain/entities/Growth';
import { ParableIntent, ParableSourceChoice, ParableScriptPlan } from '../../domain/entities/Parable';
import { BusinessCategory, WebsiteAnalysis, CategoryPromptTemplate, PromoScriptPlan } from '../../domain/entities/WebsitePromo';

/**
 * Composite LLM client that tries a primary client first,
 * then falls back to a secondary client on failure.
 */
export class FallbackLlmClient implements ILlmClient {
    private readonly primary: ILlmClient;
    private readonly fallback: ILlmClient;
    private readonly primaryName: string;
    private readonly fallbackName: string;

    constructor(
        primary: ILlmClient,
        fallback: ILlmClient,
        primaryName: string = 'Primary',
        fallbackName: string = 'Fallback'
    ) {
        this.primary = primary;
        this.fallback = fallback;
        this.primaryName = primaryName;
        this.fallbackName = fallbackName;
    }

    private async tryCall<T>(methodName: string, callFn: (client: ILlmClient) => Promise<T>): Promise<T> {
        try {
            return await callFn(this.primary);
        } catch (error: any) {
            console.warn(`[LlmFallback] ${this.primaryName}.${methodName} failed: ${error.message}. Falling back to ${this.fallbackName}...`);
            return await callFn(this.fallback);
        }
    }

    async detectReelMode(transcript: string): Promise<ReelModeDetectionResult> {
        return this.tryCall('detectReelMode', (c) => c.detectReelMode(transcript));
    }

    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        return this.tryCall('planReel', (c) => c.planReel(transcript, constraints));
    }

    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        return this.tryCall('generateSegmentContent', (c) => c.generateSegmentContent(plan, transcript));
    }

    async adjustCommentaryLength(segments: SegmentContent[], direction: 'shorter' | 'longer', targetDurationSeconds: number): Promise<SegmentContent[]> {
        return this.tryCall('adjustCommentaryLength', (c) => c.adjustCommentaryLength(segments, direction, targetDurationSeconds));
    }

    async generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]> {
        return this.tryCall('generateHooks', (c) => c.generateHooks(transcript, plan, trendContext));
    }

    async generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags> {
        return this.tryCall('generateCaptionAndTags', (c) => c.generateCaptionAndTags(fullScript, summary));
    }

    async detectContentMode(transcript: string): Promise<ContentModeDetectionResult> {
        return this.tryCall('detectContentMode', (c) => c.detectContentMode!(transcript));
    }

    async extractParableIntent(transcript: string): Promise<ParableIntent> {
        return this.tryCall('extractParableIntent', (c) => c.extractParableIntent!(transcript));
    }

    async chooseParableSource(intent: ParableIntent): Promise<ParableSourceChoice> {
        return this.tryCall('chooseParableSource', (c) => c.chooseParableSource!(intent));
    }

    async generateParableScript(intent: ParableIntent, sourceChoice: ParableSourceChoice, targetDurationSeconds: number): Promise<ParableScriptPlan> {
        return this.tryCall('generateParableScript', (c) => c.generateParableScript!(intent, sourceChoice, targetDurationSeconds));
    }

    async generateParableHooks(parableScript: ParableScriptPlan, trendContext?: string): Promise<string[]> {
        return this.tryCall('generateParableHooks', (c) => c.generateParableHooks!(parableScript, trendContext));
    }

    async generateParableCaptionAndTags(parableScript: ParableScriptPlan, summary: string): Promise<CaptionAndTags> {
        return this.tryCall('generateParableCaptionAndTags', (c) => c.generateParableCaptionAndTags!(parableScript, summary));
    }

    async selectMusicTags(transcript: string, mood: string, culture?: string, context?: string): Promise<string[]> {
        return this.tryCall('selectMusicTags', (c) => c.selectMusicTags!(transcript, mood, culture, context));
    }

    async detectBusinessCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory> {
        return this.tryCall('detectBusinessCategory', (c) => c.detectBusinessCategory!(analysis));
    }

    async generatePromoScript(analysis: WebsiteAnalysis, category: BusinessCategory, template: CategoryPromptTemplate, businessName: string, language: string): Promise<PromoScriptPlan> {
        return this.tryCall('generatePromoScript', (c) => c.generatePromoScript!(analysis, category, template, businessName, language));
    }

    async generatePersonalPromoScript(analysis: WebsiteAnalysis, personalName: string, language: string): Promise<PromoScriptPlan> {
        return this.tryCall('generatePersonalPromoScript', (c) => c.generatePersonalPromoScript!(analysis, personalName, language));
    }
}
