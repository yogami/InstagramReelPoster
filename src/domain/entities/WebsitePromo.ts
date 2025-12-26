/**
 * Website Promo Domain Entities
 *
 * Types and interfaces for the website promotional reel generation mode.
 * This module defines the domain model for generating promotional reels
 * from business website content with category-aware hooks and CTAs.
 */

/**
 * Supported business categories for promotional reels.
 * Each category has optimized hooks, showcases, and CTAs.
 */
export type BusinessCategory =
    | 'cafe'
    | 'gym'
    | 'shop'
    | 'service'
    | 'restaurant'
    | 'studio';

/**
 * Input for creating a website promo reel job.
 */
export interface WebsitePromoInput {
    /** The business website URL to scrape */
    websiteUrl: string;
    /** Business name (auto-detected if not provided) */
    businessName?: string;
    /** Category (auto-detected if not provided) */
    category?: BusinessCategory;
    /** User consent to scrape the website (REQUIRED for legal compliance) */
    consent: boolean;
}

/**
 * Result from website scraping.
 * Contains extracted content for category detection and script generation.
 */
export interface WebsiteAnalysis {
    /** Scraped hero/headline text (from H1 or title) */
    heroText: string;
    /** Meta description from the page */
    metaDescription: string;
    /** About page content (if found) */
    aboutContent?: string;
    /** Detected business name from meta tags or title */
    detectedBusinessName?: string;
    /** Detected location (e.g., Berlin, Kreuzberg) */
    detectedLocation?: string;
    /** Raw keywords extracted for category detection */
    keywords: string[];
    /** The original URL that was scraped */
    sourceUrl: string;
}

/**
 * Category-specific prompt template.
 * Provides optimized hook, showcase, and CTA for each business type.
 */
export interface CategoryPromptTemplate {
    /** Opening hook question to grab attention */
    hook: string;
    /** Showcase text describing the business value */
    showcase: string;
    /** Call-to-action text */
    cta: string;
    /** Visual style keywords for image generation */
    visuals: string;
}

/**
 * Promo scene content for a single segment.
 * Extends the standard segment structure with promo-specific fields.
 */
export interface PromoSceneContent {
    /** Duration of this scene in seconds */
    duration: number;
    /** Image generation prompt for this scene */
    imagePrompt: string;
    /** Spoken narration text */
    narration: string;
    /** Subtitle overlay text */
    subtitle: string;
    /** Scene role: hook, showcase, or cta */
    role: 'hook' | 'showcase' | 'cta';
}

/**
 * Complete promo script plan.
 * Contains all information needed to generate a website promo reel.
 */
export interface PromoScriptPlan {
    /** Core message/tagline for the business */
    coreMessage: string;
    /** Detected or provided business category */
    category: BusinessCategory;
    /** Business name */
    businessName: string;
    /** Array of promo scenes (typically 3: hook → showcase → CTA) */
    scenes: PromoSceneContent[];
    /** Music style for background */
    musicStyle: string;
    /** Generated caption for the post */
    caption: string;
    /** Compliance metadata */
    compliance: {
        source: 'public-website';
        consent: boolean;
        scrapedAt: Date;
    };
}

/**
 * Type guard for BusinessCategory.
 */
export function isBusinessCategory(value: unknown): value is BusinessCategory {
    return (
        typeof value === 'string' &&
        ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio'].includes(value)
    );
}

/**
 * Type guard for WebsitePromoInput.
 */
export function isWebsitePromoInput(obj: unknown): obj is WebsitePromoInput {
    if (!obj || typeof obj !== 'object') return false;
    const input = obj as Record<string, unknown>;
    return (
        typeof input.websiteUrl === 'string' &&
        input.websiteUrl.length > 0 &&
        typeof input.consent === 'boolean'
    );
}
