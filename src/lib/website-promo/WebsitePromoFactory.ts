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
import { ITranslationPort } from './ports/ITranslationPort';
import { ITemplateRepository } from './ports/ITemplateRepository';
import { ICachePort } from './ports/ICachePort';
import { IMetricsPort } from './ports/IMetricsPort';
import { IAvatarGenerationPort } from './ports/IAvatarGenerationPort';
import { IJobQueuePort } from './ports/IJobQueuePort';
import { ICompliancePort } from './ports/ICompliancePort';

export interface WebsitePromoSliceConfig {
    scrapingPort: IScrapingPort;
    scriptPort: IScriptGenerationPort;
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
    translationPort: ITranslationPort;
    templateRepository: ITemplateRepository;
    cachePort: ICachePort;
    metricsPort: IMetricsPort;
    compliancePort: ICompliancePort;
    avatarPort?: IAvatarGenerationPort;
    jobQueuePort?: IJobQueuePort;
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
 *     renderingPort: new FFmpegRenderingAdapter(renderer),
 *     compliancePort: new GuardianComplianceAdapter(guardian, zeroRetention, provenance)
 * });
 * ```
 */
export function createWebsitePromoSlice(config: WebsitePromoSliceConfig): WebsitePromoSlice {
    const orchestrator = new WebsitePromoOrchestrator({
        scrapingPort: config.scrapingPort,
        scriptPort: config.scriptPort,
        assetPort: config.assetPort,
        renderingPort: config.renderingPort,
        translationPort: config.translationPort,
        templateRepository: config.templateRepository,
        cachePort: config.cachePort,
        metricsPort: config.metricsPort,
        compliancePort: config.compliancePort,
        avatarPort: config.avatarPort,
        jobQueuePort: config.jobQueuePort,
        onStatusChange: config.onStatusChange,
        onComplete: config.onComplete,
        onError: config.onError
    });

    return { orchestrator };
}
