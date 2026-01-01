/**
 * Website Promo Domain Entities (Slice-Local Copy)
 * 
 * This is the slice's own domain model. It mirrors the shared types
 * but allows the slice to evolve independently.
 */

/**
 * Type of website detected for content-aware promo generation.
 */
export type SiteType = 'business' | 'personal';

/**
 * Supported business categories for promotional reels.
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
 * Personal information for portfolio sites.
 */
export interface PersonalInfo {
    fullName: string;
    title: string;
    bio?: string;
    skills: string[];
    headshotUrl?: string;
}

/**
 * Scraped media asset from website.
 */
export interface ScrapedMedia {
    url: string;
    width: number;
    height: number;
    altText?: string;
    sourcePage: string;
    isHero: boolean;
}

/**
 * Result from website scraping/analysis.
 */
export interface WebsiteAnalysis {
    heroText: string;
    metaDescription: string;
    aboutContent?: string;
    detectedBusinessName?: string;
    detectedLocation?: string;
    address?: string;
    openingHours?: string;
    phone?: string;
    email?: string;
    logoUrl?: string;
    keywords: string[];
    sourceUrl: string;
    scrapedMedia?: ScrapedMedia[];
    rawText?: string;
    cta?: { text: string; link?: string; type?: 'contact' | 'signup' | 'buy' | 'demo' };
    contact?: { email?: string; phone?: string; address?: string };
    siteType?: SiteType;
    personalInfo?: PersonalInfo;
    socialLinks?: {
        linkedin?: string;
        github?: string;
        twitter?: string;
        instagram?: string;
    };
}

/**
 * Input for creating a website promo.
 */
export interface WebsitePromoInput {
    websiteUrl: string;
    businessName?: string;
    category?: BusinessCategory;
    consent: boolean;
    language?: string;
    providedMedia?: string[];
    logoUrl?: string;
    logoPosition?: 'beginning' | 'end' | 'overlay';
    voiceId?: string;

    // Phase 2: Quality Boosts
    voiceStyle?: 'professional' | 'friendly' | 'energetic' | 'calm';
    motionStyle?: 'ken_burns' | 'zoom_in' | 'zoom_out' | 'static';
    subtitleStyle?: 'minimal' | 'bold' | 'karaoke';
}


/**
 * Promo scene content.
 */
export interface PromoSceneContent {
    duration: number;
    imagePrompt: string;
    narration: string;
    subtitle: string;
    role: 'hook' | 'showcase' | 'cta';
    visualStyle?: string;
}

/**
 * Complete promo script plan.
 */
export interface PromoScriptPlan {
    coreMessage: string;
    hookType?: string;
    category: BusinessCategory;
    businessName: string;
    scenes: PromoSceneContent[];
    musicStyle: string;
    caption: string;
    compliance: {
        source: 'public-website';
        consent: boolean;
        scrapedAt: Date;
    };
    language: string;
    logoUrl?: string;
    logoPosition?: 'beginning' | 'end' | 'overlay';

    // Phase 2: Quality Boosts
    motionStyle?: 'ken_burns' | 'zoom_in' | 'zoom_out' | 'static';
    subtitleStyle?: 'minimal' | 'bold' | 'karaoke';
}


export function isBusinessCategory(value: unknown): value is BusinessCategory {
    return (
        typeof value === 'string' &&
        ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio', 'spiritual', 'tech', 'agency'].includes(value)
    );
}

export function isWebsitePromoInput(obj: unknown): obj is WebsitePromoInput {
    if (!obj || typeof obj !== 'object') return false;
    const input = obj as Record<string, unknown>;
    return (
        typeof input.websiteUrl === 'string' &&
        input.websiteUrl.length > 0 &&
        typeof input.consent === 'boolean'
    );
}
