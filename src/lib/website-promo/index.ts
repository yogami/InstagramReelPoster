/**
 * Website Promo Slice
 * 
 * Self-contained module for generating promotional video reels from website URLs.
 * Designed as a standalone product that can be deployed independently.
 * 
 * Architecture: Clean Architecture / Ports & Adapters
 * - domain/: Business logic and entities (no external dependencies)
 * - ports/: Interface definitions (inbound and outbound)
 * - adapters/: Implementations of ports (infrastructure bindings)
 * - application/: Use cases and orchestration
 * - infrastructure/: Cross-cutting utilities (retry, etc.)
 */

// Domain
export * from './domain/entities/WebsitePromo';
export * from './domain/entities/PromoBlueprint';
export * from './domain/services/BlueprintFactory';
export { ContentDNAAnalyzer, SiteDNA } from './domain/services/ContentDNAAnalyzer';
export { VoiceStyle, VOICE_STYLE_MAP, resolveVoiceId } from './domain/services/VoiceStyles';

// Ports - Core
export * from './ports/IScrapingPort';
export * from './ports/IScriptGenerationPort';
export * from './ports/IRenderingPort';

// Ports - Phase 3 & 4
export * from './ports/ITranslationPort';
export * from './ports/ITemplateRepository';
export * from './ports/IAvatarGenerationPort';
export * from './ports/ICachePort';
export * from './ports/IMetricsPort';

// Adapters - Phase 3
export { DeepLTranslationAdapter, MockTranslationAdapter } from './adapters/DeepLTranslationAdapter';
export { InMemoryTemplateRepository } from './adapters/InMemoryTemplateRepository';
export { MockAvatarAdapter } from './adapters/MockAvatarAdapter';

// Adapters - Phase 4
export { InMemoryCacheAdapter } from './adapters/InMemoryCacheAdapter';
export { ConsoleMetricsAdapter, NoOpMetricsAdapter } from './adapters/ConsoleMetricsAdapter';

// Ports - Phase 5 (Enterprise/Berlin Moat)
export * from './ports/ICompliancePort';

// Adapters - Phase 5
export { GuardianComplianceAdapter } from './adapters/GuardianComplianceAdapter';

// Application Layer
export { WebsitePromoOrchestrator, PromoJob } from './application/WebsitePromoOrchestrator';
export { WebsitePromoUseCase } from './application/WebsitePromoUseCase';
export { BatchPromoOrchestrator, BatchPromoInput, BatchPromoResult } from './application/BatchPromoOrchestrator';

// Infrastructure Utilities
export * from './infrastructure/RetryUtils';

// Factory for easy instantiation
export { createWebsitePromoSlice, WebsitePromoSlice, WebsitePromoSliceConfig } from './WebsitePromoFactory';
