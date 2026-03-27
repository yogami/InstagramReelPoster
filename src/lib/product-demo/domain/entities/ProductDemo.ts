/**
 * Product Demo Domain Entities
 * 
 * Core domain entities for the Product Demo slice.
 * Defines inputs, analysis results, and eligibility checks.
 */

// ============================================================================
// Input Types
// ============================================================================

export type AudienceType = 'investor' | 'client';

export interface ProductDemoInput {
    /** URL of the product to demo */
    productUrl: string;
    /** Optional GitHub repository URL for additional context */
    githubUrl?: string;
    /** Target audience for the demo video */
    audienceType: AudienceType;
    /** User consent to scrape and process the URL */
    consent: boolean;
    /** Optional custom instructions for the demo */
    customInstructions?: string;
    /** Optional metadata for job tracking */
    metadata?: Record<string, any>;
    /** Force generation even if eligibility check fails (internal use) */
    force?: boolean;
}

export function isProductDemoInput(input: unknown): input is ProductDemoInput {
    if (typeof input !== 'object' || input === null) return false;
    const obj = input as Record<string, unknown>;
    return (
        typeof obj.productUrl === 'string' &&
        (obj.audienceType === 'investor' || obj.audienceType === 'client') &&
        typeof obj.consent === 'boolean'
    );
}

// ============================================================================
// SaaS Eligibility
// ============================================================================

export type ProductType = 'saas' | 'ecommerce' | 'info_product' | 'physical' | 'service' | 'unknown';

export interface SaaSEligibilityResult {
    /** Whether the product is eligible for demo video generation */
    isEligible: boolean;
    /** Detected product type */
    productType: ProductType;
    /** Human-readable reason for the decision */
    reason: string;
    /** Confidence score (0-1) */
    confidence: number;
    /** Detected problem the product solves */
    detectedProblem?: string;
    /** Whether registration/login is required to use */
    requiresAuth?: boolean;
}

// ============================================================================
// Product Analysis (from scraping)
// ============================================================================

export interface ScrapedImage {
    url: string;
    alt?: string;
    context: 'hero' | 'feature' | 'screenshot' | 'testimonial' | 'other';
    relevanceScore?: number;
}

export interface DemoButtonResult {
    found: boolean;
    type: 'video' | 'interactive' | 'signup' | 'none';
    url?: string;
    buttonText?: string;
}

export interface ProductAnalysis {
    /** Source URL */
    sourceUrl: string;
    /** Product/company name */
    productName: string;
    /** Tagline or hero text */
    tagline?: string;
    /** Meta description */
    metaDescription?: string;
    /** Detected problem the product solves */
    problemStatement?: string;
    /** How the product solves the problem */
    solutionStatement?: string;
    /** Key features extracted */
    features: string[];
    /** Scraped relevant images */
    images: ScrapedImage[];
    /** Full-page screenshots captured */
    screenshots: string[];
    /** Demo button detection result */
    demoButton?: DemoButtonResult;
    /** Whether the product requires authentication */
    requiresAuth: boolean;
    /** Embedded video URL if found on demo page */
    embeddedVideoUrl?: string;
    /** Pricing model if detected */
    pricingModel?: 'free' | 'freemium' | 'paid' | 'enterprise' | 'unknown';
    /** Target audience detected from content */
    targetAudience?: string;
}

// ============================================================================
// GitHub Context
// ============================================================================

export interface GitHubContext {
    /** Repository URL */
    repoUrl: string;
    /** Repository name */
    repoName: string;
    /** README content (markdown) */
    readmeContent?: string;
    /** Repository description */
    description?: string;
    /** Topics/tags */
    topics: string[];
    /** Tech stack from package.json or similar */
    techStack: string[];
    /** Key features extracted from docs */
    features: string[];
    /** Architecture notes if found */
    architectureNotes?: string;
    /** Stars count */
    stars?: number;
    /** License */
    license?: string;
}

// ============================================================================
// Demo Recording
// ============================================================================

export interface DemoRecordingResult {
    /** URL of the recorded demo video */
    videoUrl: string;
    /** Duration in seconds */
    durationSeconds: number;
    /** Whether authentication was encountered */
    wasAuthenticated: boolean;
    /** Whether recording was successful */
    success: boolean;
    /** Reason if recording failed */
    failureReason?: string;
}

// ============================================================================
// Result Types
// ============================================================================

export interface ProductDemoResult {
    /** Final video URL */
    videoUrl: string;
    /** Video duration in seconds */
    durationSeconds: number;
    /** Product name */
    productName: string;
    /** Audience type used */
    audienceType: AudienceType;
    /** Caption for sharing */
    caption: string;
    /** Metadata about the generation */
    metadata: {
        hadGitHubContext: boolean;
        usedLiveDemo: boolean;
        usedAIImages: boolean;
        scrapedImageCount: number;
        screenshotCount: number;
    };
}
