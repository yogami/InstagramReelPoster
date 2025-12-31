/**
 * Website Promo Domain Entities
 *
 * Types and interfaces for the website promotional reel generation mode.
 * This module defines the domain model for generating promotional reels
 * from business website content with category-aware hooks and CTAs.
 */

/**
 * Type of website detected for content-aware promo generation.
 */
export type SiteType = 'business' | 'personal';

/**
 * Personal information extracted from portfolio/personal sites.
 */
export interface PersonalInfo {
    /** Full name of the individual */
    fullName: string;
    /** Professional title or tagline (e.g., "AI Engineer", "Designer") */
    title: string;
    /** Bio or about text (200 chars max) */
    bio?: string;
    /** Core skills (3-5 max) */
    skills: string[];
    /** Headshot/profile image URL (highest priority visual) */
    headshotUrl?: string;
}

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
    | 'studio'
    | 'spiritual'
    | 'tech'
    | 'agency';

/**
 * Site DNA - Psychological analysis of business website.
 * Scores and signals used for higher-converting promo generation.
 */
export interface SiteDNA {
    /** Pain score (0-10) - How well the site communicates customer problems */
    painScore: number;

    /** Trust signals extracted from site (testimonials, ratings, client counts, press mentions) */
    trustSignals: string[];

    /** Urgency trigger if found (e.g., "Limited spots", "Book now", countdown detected) */
    urgency: string | null;

    /** Confidence score for the DNA analysis (0-1) */
    confidence: number;
}

/**
 * Content from pricing page analysis.
 */
export interface PricingContent {
    /** Pain points mentioned on pricing page */
    painPoints: string[];
    /** Pricing tiers if found */
    pricingTiers: string[];
    /** Raw text content */
    rawText: string;
}

/**
 * Content from testimonials page analysis.
 */
export interface TestimonialsContent {
    /** Extracted testimonial quotes */
    quotes: string[];
    /** Star ratings found (e.g., "4.9/5") */
    starRatings: string[];
    /** Client counts (e.g., "500+ clients") */
    clientCounts: string[];
    /** Press mentions (e.g., "Featured in TechCrunch") */
    pressMentions: string[];
}

/**
 * Scraped media asset from the business website.
 * Used for prioritized image sourcing (real images > AI generated).
 */
export interface ScrapedMedia {
    /** Direct URL to the image */
    url: string;
    /** Image width in pixels */
    width: number;
    /** Image height in pixels */
    height: number;
    /** Alt text or caption if available */
    altText?: string;
    /** Source page where image was found */
    sourcePage: string;
    /** Whether this appears to be a hero/main image */
    isHero: boolean;
}

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
    /** Output language for the promo reel (e.g., 'en', 'de') */
    language?: string;
    /** User-provided media (base64 data URIs or URLs) - used with highest priority */
    providedMedia?: string[];
    /** Company logo URL to be included in the reel */
    logoUrl?: string;
    /** Where to place the logo (beginning, end, or overlay) */
    logoPosition?: 'beginning' | 'end' | 'overlay';
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
    /** Content from /pricing page if scraped */
    pricingContent?: PricingContent;
    /** Content from /testimonials page if scraped */
    testimonialsContent?: TestimonialsContent;
    /** Detected business name from meta tags or title */
    detectedBusinessName?: string;
    /** Detected location (e.g., Berlin, Kreuzberg) */
    detectedLocation?: string;
    /** Scraped address from footer or contact page */
    address?: string;
    /** Scraped opening hours */
    openingHours?: string;
    /** Scraped phone number */
    phone?: string;
    /** Scraped email address */
    email?: string;
    /** Scraped logo URL */
    logoUrl?: string;
    /** Raw keywords extracted for category detection */
    keywords: string[];
    /** The original URL that was scraped */
    sourceUrl: string;
    /** Semantic Site DNA analysis */
    siteDNA?: SiteDNA;
    /** Scraped media assets (images) from the website */
    scrapedMedia?: ScrapedMedia[];
    /** Raw text content for LLM extraction */
    rawText?: string;
    /** Scraped CTA details */
    cta?: { text: string; link?: string; type?: 'contact' | 'signup' | 'buy' | 'demo' };
    /** Scraped Contact details */
    contact?: { email?: string; phone?: string; address?: string };

    // Restaurant Specific Fields
    /** Signature dish detected (e.g. "Gefüllte Knödel") */
    signatureDish?: string;
    /** Rating string (e.g. "4.8" or "4.8/5") */
    rating?: string;
    /** Number of reviews */
    reviewCount?: number;
    /** Link to reservation page */
    reservationLink?: string;
    /** Delivery info or links */
    deliveryLinks?: { platform: string, url: string }[];
    /** Price range (e.g. "€€") */
    priceRange?: string;

    // Site Type Detection
    /** Detected site type (business or personal) */
    siteType?: SiteType;
    /** Personal information (only populated if siteType === 'personal') */
    personalInfo?: PersonalInfo;

    // Social Media Links (especially relevant for personal sites)
    /** Social media profile URLs */
    socialLinks?: {
        linkedin?: string;
        github?: string;
        twitter?: string;
        instagram?: string;
        facebook?: string;
        website?: string;
    };
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
    /** Visual style for the renderer */
    visualStyle?: string;
}

/**
 * Complete promo script plan.
 * Contains all information needed to generate a website promo reel.
 */
export interface PromoScriptPlan {
    /** Core message/tagline for the business */
    coreMessage: string;
    /** The viral hook strategy used (e.g., 'curiosity-gap', 'pattern-interrupt') */
    hookType?: string;
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
    /** Generation language */
    language: string;
    /** Company logo URL */
    logoUrl?: string;
    /** Company logo position */
    logoPosition?: 'beginning' | 'end' | 'overlay';
}

export function isBusinessCategory(value: unknown): value is BusinessCategory {
    return (
        typeof value === 'string' &&
        ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio', 'spiritual', 'tech', 'agency'].includes(value)
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
