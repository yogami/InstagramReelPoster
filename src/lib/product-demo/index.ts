/**
 * Product Demo Slice
 * 
 * Public exports for the Product Demo slice.
 * This is an independent microservice for generating demo videos
 * from SaaS product URLs.
 */

// Factory
export { createProductDemoSlice, ProductDemoSliceConfig, ProductDemoSlice } from './ProductDemoFactory';

// Domain Entities
export {
    ProductDemoInput,
    ProductDemoResult,
    ProductAnalysis,
    GitHubContext,
    SaaSEligibilityResult,
    DemoRecordingResult,
    ScrapedImage,
    DemoButtonResult,
    AudienceType,
    ProductType,
    isProductDemoInput
} from './domain/entities/ProductDemo';

export {
    DemoBlueprint,
    DemoBeat,
    DemoBeatKind,
    VisualSource,
    BeatStyle,
    DemoScene,
    DemoScript
} from './domain/entities/DemoBlueprint';

// Domain Services
export { SaaSClassifier } from './domain/services/SaaSClassifier';
export { DemoBlueprintFactory } from './domain/services/DemoBlueprintFactory';

// Ports
export { ISaaSEligibilityPort } from './ports/ISaaSEligibilityPort';
export { IProductScrapingPort, ProductScrapingOptions } from './ports/IProductScrapingPort';
export { IGitHubScrapingPort, GitHubScrapingOptions } from './ports/IGitHubScrapingPort';
export { IDemoRecordingPort, DemoRecordingOptions, AuthCheckResult } from './ports/IDemoRecordingPort';
export { IDemoScriptGenerationPort, ScriptGenerationInput } from './ports/IDemoScriptGenerationPort';

// Adapters
export { SaaSEligibilityAdapter, SaaSEligibilityAdapterDeps } from './adapters/SaaSEligibilityAdapter';
export { PlaywrightProductScraperAdapter, PlaywrightProductScraperDeps } from './adapters/PlaywrightProductScraperAdapter';
export { GitHubScraperAdapter, GitHubScraperDeps } from './adapters/GitHubScraperAdapter';
export { PlaywrightDemoRecorderAdapter, PlaywrightDemoRecorderDeps } from './adapters/PlaywrightDemoRecorderAdapter';
export { LLMDemoScriptAdapter, LLMDemoScriptAdapterDeps } from './adapters/LLMDemoScriptAdapter';

// Application Layer
export { ProductDemoUseCase, ProductDemoUseCaseDeps } from './application/ProductDemoUseCase';
export { ProductDemoOrchestrator, ProductDemoOrchestratorDeps, DemoJob } from './application/ProductDemoOrchestrator';
