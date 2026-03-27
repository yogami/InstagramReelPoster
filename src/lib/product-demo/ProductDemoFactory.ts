/**
 * Product Demo Slice Factory
 * 
 * Factory function to create a fully-wired slice instance.
 * Provides a clean API for integrating the slice into the main application
 * or running it as a standalone service.
 */

import { ProductDemoOrchestrator, ProductDemoOrchestratorDeps, DemoJob } from './application/ProductDemoOrchestrator';
import { ISaaSEligibilityPort } from './ports/ISaaSEligibilityPort';
import { IProductScrapingPort } from './ports/IProductScrapingPort';
import { IGitHubScrapingPort } from './ports/IGitHubScrapingPort';
import { IDemoRecordingPort } from './ports/IDemoRecordingPort';
import { IDemoScriptGenerationPort } from './ports/IDemoScriptGenerationPort';

// Importing shared ports from website-promo slice
import { IAssetGenerationPort } from '../website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../website-promo/ports/IRenderingPort';
import { ICachePort } from '../website-promo/ports/ICachePort';
import { IMetricsPort } from '../website-promo/ports/IMetricsPort';

// ============================================================================
// Slice Configuration
// ============================================================================

export interface ProductDemoSliceConfig {
    // Product Demo specific ports
    eligibilityPort: ISaaSEligibilityPort;
    productScrapingPort: IProductScrapingPort;
    githubScrapingPort: IGitHubScrapingPort;
    demoRecordingPort: IDemoRecordingPort;
    scriptGenerationPort: IDemoScriptGenerationPort;

    // Shared ports (reused from website-promo)
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
    cachePort: ICachePort;
    metricsPort: IMetricsPort;

    // Voice configuration
    voiceSpeedMultiplier?: number;
    commentaryLengthPercent?: number;
    voiceId?: string;

    // Lifecycle callbacks
    onStatusChange?: ProductDemoOrchestratorDeps['onStatusChange'];
    onComplete?: ProductDemoOrchestratorDeps['onComplete'];
    onError?: ProductDemoOrchestratorDeps['onError'];
}

// ============================================================================
// Slice Interface
// ============================================================================

export interface ProductDemoSlice {
    orchestrator: ProductDemoOrchestrator;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Creates a Product Demo slice instance with all dependencies wired.
 * 
 * @example
 * ```typescript
 * const slice = createProductDemoSlice({
 *     eligibilityPort: new SaaSEligibilityAdapter({ llmClient, productScrapingPort }),
 *     productScrapingPort: new PlaywrightProductScraperAdapter({ createPage, uploadImage }),
 *     githubScrapingPort: new GitHubScraperAdapter({ httpClient }),
 *     demoRecordingPort: new PlaywrightDemoRecorderAdapter({ createRecordingContext, uploadVideo }),
 *     scriptGenerationPort: new LLMDemoScriptAdapter({ llmClient }),
 *     assetPort: existingAssetPort,
 *     renderingPort: existingRenderingPort,
 *     cachePort: existingCachePort,
 *     metricsPort: existingMetricsPort,
 *     voiceId: '88b18e0d81474a0ca08e2ea6f9df5ff4',
 *     voiceSpeedMultiplier: 1.25
 * });
 * 
 * const result = await slice.orchestrator.processJob('job-123', {
 *     productUrl: 'https://linear.app',
 *     audienceType: 'investor',
 *     consent: true
 * });
 * ```
 */
export function createProductDemoSlice(config: ProductDemoSliceConfig): ProductDemoSlice {
    const orchestrator = new ProductDemoOrchestrator({
        // Product Demo specific ports
        eligibilityPort: config.eligibilityPort,
        productScrapingPort: config.productScrapingPort,
        githubScrapingPort: config.githubScrapingPort,
        demoRecordingPort: config.demoRecordingPort,
        scriptGenerationPort: config.scriptGenerationPort,

        // Shared ports
        assetPort: config.assetPort,
        renderingPort: config.renderingPort,
        cachePort: config.cachePort,
        metricsPort: config.metricsPort,

        // Voice configuration
        voiceSpeedMultiplier: config.voiceSpeedMultiplier ?? 1.25,
        commentaryLengthPercent: config.commentaryLengthPercent ?? 0.92,
        voiceId: config.voiceId,

        // Lifecycle callbacks
        onStatusChange: config.onStatusChange,
        onComplete: config.onComplete,
        onError: config.onError
    });

    return { orchestrator };
}
