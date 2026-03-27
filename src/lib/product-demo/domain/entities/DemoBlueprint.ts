/**
 * Demo Blueprint Entity
 * 
 * Represents the creative blueprint for a product demo video.
 * Contains story beats that drive the narrative for investors or clients.
 */

import { AudienceType } from './ProductDemo';

// ============================================================================
// Beat Types
// ============================================================================

export type DemoBeatKind =
    | 'HOOK'                  // Opening attention grabber
    | 'PROBLEM'               // The problem being solved
    | 'TRADITIONAL_SOLUTION'  // How it's currently being solved (pain point)
    | 'PRODUCT_SOLUTION'      // How this product solves it
    | 'LIVE_DEMO'             // Recorded demo of the product
    | 'FEATURES'              // Key features highlight
    | 'SOCIAL_PROOF'          // Testimonials, traction, stats
    | 'CTA';                  // Call to action

export type VisualSource =
    | 'scraped'     // Image scraped from product page
    | 'generated'   // AI-generated image
    | 'recorded'    // Playwright screen recording
    | 'screenshot'; // Static screenshot from Playwright

export type BeatStyle =
    | 'cinematic_intro'
    | 'problem_illustration'
    | 'pain_point_montage'
    | 'product_showcase'
    | 'screen_recording'
    | 'feature_highlight'
    | 'testimonial_quote'
    | 'stats_display'
    | 'cta_finale';

// ============================================================================
// Demo Beat
// ============================================================================

export interface DemoBeat {
    /** Unique identifier */
    id: string;
    /** Type of beat in the narrative */
    kind: DemoBeatKind;
    /** Visual style for this beat */
    style: BeatStyle;
    /** Duration in seconds */
    duration: number;
    /** Source of the visual content */
    visualSource: VisualSource;
    /** Narration text for voiceover */
    narration: string;
    /** Instruction for visual generation/selection */
    visualInstruction: string;
    /** Optional URL of pre-existing asset */
    assetUrl?: string;
}

// ============================================================================
// Demo Blueprint
// ============================================================================

export interface DemoBlueprint {
    /** Ordered sequence of beats */
    beats: DemoBeat[];
    /** Target audience */
    audienceType: AudienceType;
    /** Total estimated duration in seconds */
    totalDuration: number;
    /** Suggested color palette (hex codes) */
    colorPalette: string[];
    /** Suggested music style */
    musicStyle: string;
    /** Product name for overlays */
    productName: string;
}

// ============================================================================
// Demo Scene (for script generation)
// ============================================================================

export interface DemoScene {
    /** Scene order (1-indexed) */
    order: number;
    /** Duration in seconds */
    duration: number;
    /** Narration for voiceover */
    narration: string;
    /** Subtitle text */
    subtitle: string;
    /** Image generation prompt OR asset URL */
    imagePrompt: string;
    /** Role in the narrative */
    role: DemoBeatKind;
    /** Visual source type */
    visualSource: VisualSource;
}

// ============================================================================
// Demo Script
// ============================================================================

export interface DemoScript {
    /** Target audience */
    audienceType: AudienceType;
    /** Product name */
    productName: string;
    /** Core message/value proposition */
    coreMessage: string;
    /** Ordered scenes */
    scenes: DemoScene[];
    /** Full narration text (for TTS) */
    fullNarration: string;
    /** Estimated total duration */
    estimatedDurationSeconds: number;
    /** Suggested music style */
    musicStyle: string;
    /** Caption for social sharing */
    caption: string;
    /** Language code */
    language: string;
}
