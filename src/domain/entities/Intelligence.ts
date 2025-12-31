import { WebsiteAnalysis } from './WebsitePromo';

/**
 * PHASE 1: Domain Modeling
 * 
 * Defines the core types/interfaces for the Website-to-Video intelligence layer.
 * Flow: WebsiteAnalysis -> NormalizedPage -> SiteClassification -> VideoBlueprint
 */

// --- 1. NORMALIZATION ---

/**
 * A semantic representation of a webpage, independent of its raw HTML structure.
 * Abstracts "scraper noise" into usable building blocks.
 */
export interface NormalizedPage {
    hero: {
        headline: string;
        subhead: string;
        visualUrl?: string; // High-quality hero image or video frame
    };
    features: {
        title: string;
        description: string;
        icon?: string;
    }[];
    socialProof: {
        testimonials: { quote: string; author: string }[];
        logos: string[]; // Partner/Client logos
        stats: { label: string; value: string }[]; // e.g. "500+ Users"
    };
    pricing: {
        hasFreeTier: boolean;
        pricePoint?: string; // e.g. "$29/mo"
        model?: 'SUBSCRIPTION' | 'ONE_TIME' | 'QUOTE';
    };
    cta: {
        text: string;
        link: string;
        type: 'signup' | 'contact' | 'buy' | 'demo';
    };
    contact: {
        email?: string;
        phone?: string;
        address?: string;
        openingHours?: string;
    };
    meta: {
        title: string;
        description: string;
        originalUrl: string;
    };
    // Reference to original raw data if needed for fallback
    rawAnalysis: WebsiteAnalysis;
}

// --- 2. CLASSIFICATION ---

export enum SiteType {
    SAAS_LANDING = 'SAAS_LANDING',     // Software/App landing pages
    ECOMMERCE = 'ECOMMERCE',           // Online stores, product pages
    LOCAL_SERVICE = 'LOCAL_SERVICE',   // Plumbers, Dentists, Restaurants
    PORTFOLIO = 'PORTFOLIO',           // Individual creators, agencies
    BLOG = 'BLOG',                     // Content-heavy, news
    COURSE = 'COURSE',                 // Education, coaching
    OTHER = 'OTHER'
}

export enum PrimaryIntent {
    FAST_EASY = 'FAST_EASY',      // "Set up in 5 minutes"
    TRUST_PROOF = 'TRUST_PROOF',  // "Trusted by 500 banks"
    PREMIUM = 'PREMIUM',          // "Luxury crafted in Italy"
    DEALS = 'DEALS',              // "50% off this week"
    AUTHORITY = 'AUTHORITY',      // "Teaches industry standards"
    CONTACT = 'CONTACT'           // "Call us now"
}

export interface SiteClassification {
    type: SiteType;
    intent: PrimaryIntent;
    confidence: number; // 0.0 to 1.0
    reasoning: string[]; // Why this classification?
}

// --- 3. BLUEPRINT (STORY GRAPH) ---

/**
 * Visual style constraint for a beat.
 */
export type BeatStyle =
    | 'zoom_screenshot'  // Ken Burns on UI
    | 'split_ui'         // Text Left / UI Right
    | 'kinetic_text'     // Big bold text animations
    | 'talking_head'     // AI Avatar or Spokesperson
    | 'logo_grid'        // Quick flash of logos
    | 'scroll_capture'   // Scrolling down a page
    | 'product_close_up' // Product specific
    | 'cinematic_broll'  // Stock/B-roll footage
    | 'quote_animation'  // Animated text for testimonials
    | 'logo_button';     // Focus on CTA button

/**
 * A single "beat" or scene in the video story.
 */
export interface StoryBeat {
    id: string; // unique string (e.g., 'hero_01')
    kind: 'HOOK' | 'PROBLEM' | 'SOLUTION' | 'DEMO' | 'PROOF' | 'CTA';
    duration: number; // seconds
    style: BeatStyle;

    // Content mapping
    contentSource: string; // Dot notation path to NormalizedPage (e.g. 'hero.subhead')
    contentValue?: string | any; // Resolved actual content from the page

    // Instructions for the Generator/LLM
    scriptInstruction: string; // What should the narration cover?
    visualInstruction: string; // What exactly should be shown?
}

/**
 * The Architect's Blueprint.
 * A platform-agnostic plan for the video.
 */
export interface VideoBlueprint {
    classification: SiteClassification;
    beats: StoryBeat[];
    totalDuration: number;

    // Branding constraints
    colorPalette?: string[];
    fontPairing?: string;
}
