/**
 * Website Promo Slice Factory
 * 
 * Factory function to create a fully-wired slice instance.
 * Provides a clean API for integrating the slice into the main application
 * or running it as a standalone service.
 */

import { WebsitePromoOrchestrator, WebsitePromoOrchestratorDeps } from './application/WebsitePromoOrchestrator';
import { IScrapingPort } from './ports/IScrapingPort';
import { IScriptGenerationPort } from './ports/IScriptGenerationPort';
import { IAssetGenerationPort } from './ports/IAssetGenerationPort';
import { IRenderingPort } from './ports/IRenderingPort';

export interface WebsitePromoSliceConfig {
    scrapingPort: IScrapingPort;
    scriptPort: IScriptGenerationPort;
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
    onStatusChange?: WebsitePromoOrchestratorDeps['onStatusChange'];
    onComplete?: WebsitePromoOrchestratorDeps['onComplete'];
    onError?: WebsitePromoOrchestratorDeps['onError'];
}

export interface WebsitePromoSlice {
    orchestrator: WebsitePromoOrchestrator;
}

/**
 * Creates a Website Promo slice instance with all dependencies wired.
 * 
 * @example
 * ```typescript
 * const slice = createWebsitePromoSlice({
 *     scrapingPort: new WebsiteScraperAdapter(scraperClient),
 *     scriptPort: new GptScriptAdapter(llmClient),
 *     assetPort: new AssetGenerationAdapter(ttsClient, imageClient),
 *     renderingPort: new FFmpegRenderingAdapter(renderer)
 * });
 * 
 * const result = await slice.orchestrator.processJob('job_123', {
 *     websiteUrl: 'https://example.com',
 *     consent: true
 * });
 * ```
 */
export function createWebsitePromoSlice(config: WebsitePromoSliceConfig): WebsitePromoSlice {
    const orchestrator = new WebsitePromoOrchestrator({
        scrapingPort: config.scrapingPort,
        scriptPort: config.scriptPort,
        assetPort: config.assetPort,
        renderingPort: config.renderingPort,
        onStatusChange: config.onStatusChange,
        onComplete: config.onComplete,
        onError: config.onError
    });

    return { orchestrator };
}
