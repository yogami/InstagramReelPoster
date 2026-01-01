/**
 * Website Promo Use Case
 * 
 * Core application logic that coordinates the promo generation workflow.
 * Uses ports for all external interactions, ensuring testability and independence.
 */

import { WebsitePromoInput, WebsiteAnalysis, PromoScriptPlan, BusinessCategory } from '../domain/entities/WebsitePromo';
import { PromoBlueprint } from '../domain/entities/PromoBlueprint';
import { BlueprintFactory } from '../domain/services/BlueprintFactory';
import { IScrapingPort } from '../ports/IScrapingPort';
import { IScriptGenerationPort } from '../ports/IScriptGenerationPort';
import { IAssetGenerationPort } from '../ports/IAssetGenerationPort';
import { IRenderingPort, RenderingResult } from '../ports/IRenderingPort';

export interface WebsitePromoResult {
    videoUrl: string;
    caption: string;
    businessName: string;
    category: BusinessCategory;
    durationSeconds: number;
}

export interface WebsitePromoUseCaseDeps {
    scrapingPort: IScrapingPort;
    scriptPort: IScriptGenerationPort;
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
}

export class WebsitePromoUseCase {
    private readonly blueprintFactory = new BlueprintFactory();

    constructor(private readonly deps: WebsitePromoUseCaseDeps) { }

    /**
     * Executes the full website-to-video promo generation workflow.
     */
    async execute(input: WebsitePromoInput): Promise<WebsitePromoResult> {
        // 1. Scrape website
        const analysis = await this.deps.scrapingPort.scrape({
            url: input.websiteUrl,
            deepScrape: true
        });

        // 2. Detect category
        const category = input.category || await this.deps.scriptPort.detectCategory(analysis);

        // 3. Generate script
        const script = await this.deps.scriptPort.generateScript({
            websiteAnalysis: analysis,
            category,
            language: input.language || 'en',
            targetDurationSeconds: 30
        });

        // 4. Create blueprint (pure domain logic)
        const blueprint = this.blueprintFactory.create(analysis, category);

        // 5. Generate assets
        const narration = script.scenes.map(s => s.narration).join(' ');
        const voiceover = await this.deps.assetPort.generateVoiceover(narration, {
            language: input.language
        });

        const images = await this.deps.assetPort.generateImages(script.scenes);
        const music = await this.deps.assetPort.selectMusic(category, voiceover.durationSeconds);
        const subtitles = await this.deps.assetPort.generateSubtitles(voiceover.url);

        // 6. Render video
        const renderResult = await this.deps.renderingPort.render(script, {
            voiceoverUrl: voiceover.url,
            musicUrl: music.url,
            subtitlesUrl: subtitles,
            imageUrls: images,
            logoUrl: input.logoUrl
        });

        return {
            videoUrl: renderResult.videoUrl,
            caption: script.caption,
            businessName: script.businessName,
            category: script.category,
            durationSeconds: renderResult.durationSeconds
        };
    }
}
