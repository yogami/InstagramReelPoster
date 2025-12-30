/**
 * Parable Domain Entities
 * 
 * Types and interfaces for the parable-based spiritual storytelling mode.
 * This module defines the domain model for generating story-driven parables
 * as an alternative content style to direct commentary.
 */

/**
 * Content mode distinguishes story-style from direct commentary.
 * - 'direct-message': Current behavior - direct commentary/rant style
 * - 'parable': Story-driven micro-parables with 4-beat narrative structure
 */
export type ContentMode = 'direct-message' | 'parable';

/**
 * Forced mode from job input (explicit user choice).
 * - 'direct': Force direct-message mode
 * - 'parable': Force parable mode
 * - 'website-promo': Force website promotional reel mode
 */
export type ForceMode = 'direct' | 'parable' | 'website-promo' | 'youtube-short';

/**
 * Source type for parable content.
 * - 'provided-story': User describes a specific tale or historical figure
 * - 'theme-only': User provides abstract theme, system generates story
 */
export type ParableSourceType = 'provided-story' | 'theme-only';

/**
 * Cultural traditions for parable settings.
 * Selected from a curated spiritual pool to ensure authentic representation.
 */
export type ParableCulture =
    | 'indian'
    | 'chinese'
    | 'japanese'
    | 'sufi'
    | 'western-folklore'
    | 'generic-eastern';

/**
 * Archetypal characters for parables.
 * Universal figures that resonate across spiritual traditions.
 */
export type ParableArchetype =
    | 'monk'
    | 'sage'
    | 'saint'
    | 'warrior'
    | 'king'
    | 'farmer'
    | 'villager'
    | 'student';

/**
 * Extracted intent from transcript for parable mode.
 * Captures what the user wants to convey through the parable.
 */
export interface ParableIntent {
    /** How the story content is sourced */
    sourceType: ParableSourceType;
    /** Core psychological/spiritual theme (e.g., gossip, envy, ego) */
    coreTheme: string;
    /** 1-2 sentence insight the user wants to convey */
    moral: string;
    /** User's preferred cultural setting, if specified */
    culturalPreference?: ParableCulture;
    /** Specific constraints (e.g., "must be about a monk") */
    constraints?: string[];
    /** For provided-story: specific character names and story details from transcript */
    providedStoryContext?: string;
}

/**
 * LLM's choice of story-world when generating from theme.
 * Ensures diverse cultural representation across reels.
 */
export interface ParableSourceChoice {
    /** Selected cultural tradition */
    culture: ParableCulture;
    /** Selected character archetype */
    archetype: ParableArchetype;
    /** Explanation for the choice (for debugging/analytics) */
    rationale: string;
}

/**
 * Role of each beat in the 4-beat parable structure.
 * - hook: Pattern-breaking opening (6-8s)
 * - setup: Character + tension establishment (8-12s)
 * - turn: Confrontation/revelation moment (6-10s)
 * - moral: Contemporary insight in creator's voice (5-8s)
 */
export type ParableBeatRole = 'hook' | 'setup' | 'turn' | 'moral';

/**
 * A single beat in the parable script.
 * Each beat maps to a segment in the final video.
 */
export interface ParableBeat {
    /** Role in the narrative structure */
    role: ParableBeatRole;
    /** Spoken narration text */
    narration: string;
    /** Concise overlay text for subtitles */
    textOnScreen: string;
    /** 2D stylized cartoon image prompt */
    imagePrompt: string;
    /** Target duration for this beat in seconds */
    approxDurationSeconds: number;
}

/**
 * Complete parable script plan.
 * Contains all information needed to generate a parable reel.
 */
export interface ParableScriptPlan {
    /** Always 'parable' for type discrimination */
    mode: 'parable';
    /** Extracted user intent */
    parableIntent: ParableIntent;
    /** Selected story-world */
    sourceChoice: ParableSourceChoice;
    /** Four narrative beats */
    beats: ParableBeat[];
}

/**
 * Type guard for ParableIntent.
 * Validates that an object has the required structure.
 */
export function isParableIntent(obj: unknown): obj is ParableIntent {
    if (!obj || typeof obj !== 'object') return false;
    const intent = obj as Record<string, unknown>;
    return (
        typeof intent.sourceType === 'string' &&
        (intent.sourceType === 'provided-story' || intent.sourceType === 'theme-only') &&
        typeof intent.coreTheme === 'string' &&
        intent.coreTheme.length > 0 &&
        typeof intent.moral === 'string' &&
        intent.moral.length > 0
    );
}

/**
 * Type guard for ParableScriptPlan.
 * Validates that an object has the required structure.
 */
export function isParableScriptPlan(obj: unknown): obj is ParableScriptPlan {
    if (!obj || typeof obj !== 'object') return false;
    const plan = obj as Record<string, unknown>;
    return (
        plan.mode === 'parable' &&
        isParableIntent(plan.parableIntent) &&
        typeof plan.sourceChoice === 'object' &&
        plan.sourceChoice !== null &&
        Array.isArray(plan.beats) &&
        plan.beats.length > 0
    );
}
