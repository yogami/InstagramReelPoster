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
 */

// Domain
export * from './domain/entities/WebsitePromo';
export * from './domain/entities/PromoBlueprint';
export * from './domain/services/BlueprintFactory';

// Ports
export * from './ports/IScrapingPort';
export * from './ports/IScriptGenerationPort';
export * from './ports/IRenderingPort';

// Application
export { WebsitePromoOrchestrator } from './application/WebsitePromoOrchestrator';
export { WebsitePromoUseCase } from './application/WebsitePromoUseCase';

// Factory for easy instantiation
export { createWebsitePromoSlice } from './WebsitePromoFactory';
