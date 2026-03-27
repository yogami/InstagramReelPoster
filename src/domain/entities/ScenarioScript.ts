/**
 * A character in a scenario dialogue.
 */
export interface ScenarioCharacter {
    /** Display name (e.g., "Cole", "Lisa") */
    name: string;
    /** Gender determines voice selection */
    gender: 'male' | 'female';
    /** Brief personality descriptor for LLM prompt context */
    personality: string;
}

/**
 * Emotion tag for a dialogue line — controls TTS delivery nuance.
 */
export type DialogueEmotion =
    | 'neutral'
    | 'defensive'
    | 'passionate'
    | 'sarcastic'
    | 'empathetic'
    | 'frustrated'
    | 'calm'
    | 'confrontational';

/**
 * A single line of dialogue in a scenario.
 */
export interface DialogueLine {
    /** Which character speaks this line */
    characterName: string;
    /** The spoken text */
    text: string;
    /** Delivery emotion for TTS/visual styling */
    emotion: DialogueEmotion;
}

/**
 * A complete scenario script — the output of the ScenarioScriptGenerator.
 */
export interface ScenarioScript {
    /** Title shown in post caption (e.g., "The Boring Paradox") */
    title: string;
    /** High-level relationship topic */
    topic: string;
    /** Characters involved in the dialogue */
    characters: ScenarioCharacter[];
    /** Attention-grabbing hook (first line or opening statement) */
    hook: string;
    /** The dialogue lines in order */
    dialogue: DialogueLine[];
    /** Closing insight / mic-drop line */
    conclusion: string;
    /** Hashtags for the post */
    hashtags: string[];
    /** Estimated total word count */
    wordCount: number;
}

/**
 * Episode format — determines how many characters are in the scene.
 *
 * - 'solo':  One character. Internal monologue, voiceover reflection, or journal entry.
 * - 'duo':   Two characters. Dialogue-driven scene, argument, or conversation.
 * - 'group': Three or more characters. Social scene, group tension, or split perspectives.
 */
export type EpisodeFormat = 'solo' | 'duo' | 'group';

/**
 * Input for creating an episode of the microdrama series.
 *
 * The user drives the episode spontaneously — format and theme can be anything.
 * The topic library is optional; a free-form premise overrides it.
 */
export interface ScenarioInput {
    /**
     * Episode format — solo reflection, two-person dialogue, or group scene.
     * Defaults to 'duo' if omitted.
     */
    format?: EpisodeFormat;

    /**
     * Free-form theme or premise for this episode.
     * Overrides the topic library when provided.
     * Examples: "Why she always goes back", "3am thoughts about getting older",
     *           "He finally admits it", "The group finds out"
     */
    theme?: string;

    /**
     * Optional lookup key into the paired topic library (for structured topics).
     * Ignored if `theme` is set.
     */
    topic?: string;

    /**
     * Names of characters to use — pulled from CharacterRoster by name.
     * For duo: ['Ren', 'Zara']
     * For solo: ['Noa']
     * For group: ['Ren', 'Zara', 'Kai']
     * Defaults to canonical pairing (Ren + Zara) if not specified.
     */
    characters?: string[];

    /**
     * @deprecated Use `characters` array and `format` instead.
     * Kept for backward compatibility with the old route format.
     */
    characterNames?: { male: string; female: string };

    /** Target duration in seconds (default: 50) */
    targetDurationSeconds?: number;

    /** Language for dialogue (default: 'en') */
    language?: string;
}

/**
 * Timing marker for a single dialogue line after TTS synthesis.
 */
export interface DialogueTimingMarker {
    /** Index in the dialogue array */
    index: number;
    /** Character name who speaks */
    characterName: string;
    /** The spoken text */
    text: string;
    /** Start time in seconds from the beginning of the combined audio */
    startTime: number;
    /** End time in seconds */
    endTime: number;
    /** Duration of this line in seconds */
    durationSeconds: number;
}
