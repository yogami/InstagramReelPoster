/**
 * CharacterRoster — The Permanent Cast of the Microdrama Series.
 *
 * DESIGN PRINCIPLES:
 * - Names are SHORT (1–2 syllables), phonetically simple, NOT tied to any
 *   specific race, ethnicity, or culture. They feel like characters, not people.
 * - Each character is an ARCHETYPE — consistent across all episodes.
 * - Characters appear in specific PAIRINGS that create natural dramatic tension.
 * - The same character will exhibit the SAME worldview and blind spots every
 *   time they appear, creating a sense of a living, serialized universe.
 *
 * SERIES STRUCTURE:
 * The show centers on two overlapping social circles — people who orbit the same
 * world but see it very differently. Think "Normal People" meets dark psychology
 * meets Gen Z rawness.
 */

export type CharacterGender = 'male' | 'female';

export interface SeriesCharacter {
    /** Short, race-neutral, culture-neutral name */
    name: string;
    gender: CharacterGender;
    /** Core personality archetype — stays CONSTANT across all episodes */
    archetype: string;
    /** One-line emotional signature — how this character processes the world */
    emotionalSignature: string;
    /** Their core blind spot — what they can never fully see about themselves */
    blindSpot: string;
    /** Dialogue voice style — how they actually sound */
    voiceStyle: string;
    /** Which pairings they appear in (other character names) */
    pairedWith: string[];
}

/**
 * THE CAST
 * ─────────
 * Six recurring characters across three core relationship dynamics.
 * Each pairing explores a different dimension of love, psychology, and Gen Z life.
 */
export const CAST: SeriesCharacter[] = [
    // ── MAIN COUPLE ────────────────────────────────────────────────────────────
    {
        name: 'Ren',
        gender: 'male',
        archetype: 'The Stoic Realist',
        emotionalSignature: 'Calm to the point of feeling cold. He tells the truth without softening it — not to be cruel, but because he genuinely believes people can handle it.',
        blindSpot: 'Mistakes detachment for maturity. He can articulate everything that is wrong but rarely what he feels.',
        voiceStyle: 'Short sentences. Low register. Doesn\'t raise his voice. Pauses before saying the hard thing.',
        pairedWith: ['Zara', 'Kai'],
    },
    {
        name: 'Zara',
        gender: 'female',
        archetype: 'The Emotionally Awake Skeptic',
        emotionalSignature: 'Deeply perceptive, slightly exhausted. She\'s been through enough to see patterns — in him, in herself, in everything.',
        blindSpot: 'Confuses intensity with connection. Mistakes being seen as being loved.',
        voiceStyle: 'Starts composed, builds heat. Uses "honestly" a lot. Ends sentences she doesn\'t want to finish.',
        pairedWith: ['Ren', 'Noa'],
    },

    // ── SECONDARY COUPLE ───────────────────────────────────────────────────────
    {
        name: 'Sol',
        gender: 'male',
        archetype: 'The Avoidant Overachiever',
        emotionalSignature: 'Successful, magnetic, and emotionally unavailable in the specific way that makes him magnetic. Runs from intimacy by staying busy.',
        blindSpot: 'Believes he is a free spirit. He is actually afraid.',
        voiceStyle: 'Charming deflections. Reframes emotional questions as logistical ones. Laughs when things get too real.',
        pairedWith: ['Noa', 'Ren'],
    },
    {
        name: 'Noa',
        gender: 'female',
        archetype: 'The Anxious Idealist',
        emotionalSignature: 'She loves harder than anyone in the room and hates herself for it. Reads every text twice.',
        blindSpot: 'Mistakes emotional labor for love. Keeps fixing men who never asked to be fixed.',
        voiceStyle: 'Asks too many questions. Self-corrects mid-sentence. Vulnerable then immediately defensive.',
        pairedWith: ['Sol', 'Zara'],
    },

    // ── WILD CARD / SOCIAL MIRROR ──────────────────────────────────────────────
    {
        name: 'Kai',
        gender: 'male',
        archetype: 'The Brutally Honest Friend',
        emotionalSignature: 'The one in the group who says what everyone is thinking but would never say. No social filter. Genuinely cares, expresses it terribly.',
        blindSpot: 'Uses truth as a weapon and calls it honesty. Hasn\'t looked at his own life in years.',
        voiceStyle: 'Blunt. Funny. Ends with a question that lands like a gut punch.',
        pairedWith: ['Ren', 'Rue'],
    },
    {
        name: 'Rue',
        gender: 'female',
        archetype: 'The Self-Aware Disruptor',
        emotionalSignature: 'She has done the therapy, read the books, and is still making the same mistakes — but more consciously. Finds dark humor in her own patterns.',
        blindSpot: 'Intellectualizes everything so she never has to feel it fully.',
        voiceStyle: 'Wry. Self-deprecating. References psychology concepts ironically. Can pivot from funny to devastating in one sentence.',
        pairedWith: ['Kai', 'Zara'],
    },
];

/**
 * The canonical pairings — each creates a different emotional dynamic.
 */
export const CANONICAL_PAIRINGS: Array<{
    label: string;
    description: string;
    male: string;
    female: string;
    tension: string;
}> = [
        {
            label: 'Core',
            description: 'The Main Couple',
            male: 'Ren',
            female: 'Zara',
            tension: 'Emotional distance vs emotional hunger. He\'s clear-eyed but closed-off. She sees everything and still stays.',
        },
        {
            label: 'Toxic Loop',
            description: 'The Complicated Situationship',
            male: 'Sol',
            female: 'Noa',
            tension: 'Avoidant meets anxious. He disappears. She analyzes why. Neither can stop.',
        },
        {
            label: 'Mirror',
            description: 'The Friendship That Tells the Truth',
            male: 'Kai',
            female: 'Rue',
            tension: 'Two people who know too much about their own psychology to pretend — but not enough to change.',
        },
        {
            label: 'Crossfire',
            description: 'When worlds collide',
            male: 'Ren',
            female: 'Noa',
            tension: 'His realism vs her idealism. He refuses to give her hope he doesn\'t believe in.',
        },
    ];

/**
 * Returns a character by name.
 */
export function getCharacter(name: string): SeriesCharacter | undefined {
    return CAST.find(c => c.name.toLowerCase() === name.toLowerCase());
}

/**
 * Returns a canonical pairing by label.
 */
export function getPairingByLabel(label: string): typeof CANONICAL_PAIRINGS[number] | undefined {
    return CANONICAL_PAIRINGS.find(p => p.label.toLowerCase() === label.toLowerCase());
}

/**
 * Returns the default main couple (Ren + Zara).
 */
export function getDefaultPairing(): typeof CANONICAL_PAIRINGS[number] {
    return CANONICAL_PAIRINGS[0];
}

/**
 * Returns a random canonical pairing.
 */
export function getRandomPairing(): typeof CANONICAL_PAIRINGS[number] {
    return CANONICAL_PAIRINGS[Math.floor(Math.random() * CANONICAL_PAIRINGS.length)];
}

/**
 * Returns male and female characters for a pairing label.
 */
export function getCharactersForPairing(label?: string): {
    male: SeriesCharacter;
    female: SeriesCharacter;
} {
    const pairing = label ? (getPairingByLabel(label) || getDefaultPairing()) : getDefaultPairing();
    const male = getCharacter(pairing.male)!;
    const female = getCharacter(pairing.female)!;
    return { male, female };
}
