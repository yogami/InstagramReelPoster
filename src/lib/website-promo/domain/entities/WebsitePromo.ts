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
    | 'agency'
    | 'healthcare'
    | 'pharma'
    | 'realestate';

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
    voiceStyle?:
    | 'professional' | 'friendly' | 'energetic' | 'calm'
    | 'german' | 'french' | 'spanish' | 'japanese' | 'sophisticated';
    motionStyle?: 'ken_burns' | 'zoom_in' | 'zoom_out' | 'static';
    subtitleStyle?: 'minimal' | 'bold' | 'karaoke';
    templateId?: string;
    avatarId?: string;

    // Berlin Specialist Strategy (DACH Market)
    formality?: 'formal' | 'informal'; // Sie (formal) vs Du (informal)
    tone?: 'professional' | 'energetic' | 'creative' | 'eco-focused' | 'minimalist';
    market?: 'berlin' | 'dach' | 'global';
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
    mediaIntent?: string;
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
        guardianAuditId?: string;
        provenanceId?: string;
    };
    language: string;
    logoUrl?: string;
    logoPosition?: 'beginning' | 'end' | 'overlay';

    // Phase 2: Quality Boosts
    motionStyle?: 'ken_burns' | 'zoom_in' | 'zoom_out' | 'static';
    subtitleStyle?: 'minimal' | 'bold' | 'karaoke';
    templateId?: string;
    avatarId?: string;

    // Berlin Specialist
    market?: 'berlin' | 'dach' | 'global';
    formality?: 'formal' | 'informal';
}


export function isBusinessCategory(value: unknown): value is BusinessCategory {
    return (
        typeof value === 'string' &&
        ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio', 'spiritual', 'tech', 'agency', 'healthcare', 'pharma', 'realestate'].includes(value)
    );
}

/**
 * Validates the Input for Website Promo
 */
export function isWebsitePromoInput(input: any): input is WebsitePromoInput {
    return (
        typeof input === 'object' &&
        input !== null &&
        typeof input.websiteUrl === 'string' &&
        input.websiteUrl.length > 0 &&
        input.consent === true
    );
}
