/**
 * ScenarioTopicLibrary — curated bank of gender-balanced relationship topics.
 *
 * KEY PRINCIPLE: Every scenario has two mirrored perspectives:
 *   - Her lens: how this biological/psychological dynamic manifests in women's experience
 *   - His lens: how the SAME dynamic manifests in men's experience
 *
 * This reflects the reality that hypergamy ↔ polygamy, Nice Guy ↔ Good Girl,
 * Madonna/Whore ↔ Player/Provider are expressions of the SAME underlying biology.
 * The goal is to highlight nature, not polarize genders.
 */

export interface ScenarioTopic {
    /** Short title for the scenario */
    title: string;
    /** Relationship category */
    category: string;
    /** Brief scenario setup for the LLM prompt */
    premise: string;
    /** Suggested mood / emotional arc */
    mood: string;
}

/**
 * A paired scenario: two mirrored perspectives on the same dynamic.
 * Reels should sequence herLens → hisLens back-to-back.
 */
export interface ScenarioPair {
    /** Name of the biological/psychological dynamic */
    dynamic: string;
    /** Category for grouping */
    category: string;
    /** Her perspective on this dynamic */
    herLens: ScenarioTopic;
    /** His perspective on the same dynamic */
    hisLens: ScenarioTopic;
}

const PAIRED_LIBRARY: ScenarioPair[] = [
    // --- Nice Guy ↔ Good Girl ---
    {
        dynamic: 'The Nice Paradox',
        category: 'mating-strategy',
        herLens: {
            title: 'The Nice Guy Paradox',
            category: 'mating-strategy',
            premise: 'He does everything "right" — kind, attentive, available — yet she feels no attraction. She explains that niceness is not desire. A man who is only nice is performing, not connecting. Attraction requires polarity, not people-pleasing.',
            mood: 'defensive → honest',
        },
        hisLens: {
            title: 'The Good Girl Paradox',
            category: 'mating-strategy',
            premise: 'She does everything "right" — loyal, supportive, agreeable — yet he takes her for granted. He explains that agreeableness without boundaries is invisible. A woman who never challenges him never earns his deep respect. Being "easy" is not the same as being valued.',
            mood: 'frustrated → reflective',
        },
    },

    // --- Madonna/Whore ↔ Player/Provider ---
    {
        dynamic: 'The Dual Evaluation',
        category: 'biological-wiring',
        herLens: {
            title: 'Player or Provider?',
            category: 'biological-wiring',
            premise: 'She evaluates men on two axes: exciting vs. stable. The player gives dopamine but no security. The provider gives security but no excitement. She unpacks why women are biologically wired to want both — and why settling for one creates resentment.',
            mood: 'confrontational → vulnerable',
        },
        hisLens: {
            title: 'The Madonna/Whore Complex',
            category: 'biological-wiring',
            premise: 'He evaluates women on two axes: respectable vs. desirable. He wants a woman he admires publicly AND desires privately. He unpacks why men are biologically wired to split women into categories — and how this dual evaluation destroys relationships.',
            mood: 'analytical → uncomfortable',
        },
    },

    // --- Hypergamy ↔ Polygamy ---
    {
        dynamic: 'Nature of Selection',
        category: 'biological-wiring',
        herLens: {
            title: 'She Wants the Best',
            category: 'biological-wiring',
            premise: 'She is always evaluating whether she could "do better." He calls it hypergamy. She explains it is not greed — it is a survival instinct. Women evolved to secure the best possible genes and resources for offspring. It is biology, not betrayal.',
            mood: 'defensive → philosophical',
        },
        hisLens: {
            title: 'He Wants Variety',
            category: 'biological-wiring',
            premise: 'He is attracted to multiple women even in a committed relationship. She calls it cheating instinct. He explains it is not disrespect — it is reproductive biology. Men evolved to spread genes widely. The top 1% who CAN act on it behave exactly like women who branch-swing. Same biology, different expression.',
            mood: 'confrontational → sobering',
        },
    },

    // --- Emotional Availability (mirrored) ---
    {
        dynamic: 'Emotional Presence',
        category: 'emotional-availability',
        herLens: {
            title: 'Everything Except Presence',
            category: 'emotional-availability',
            premise: 'He gave gifts, trips, financial security — everything except emotional presence. She explains that a man who cannot sit with difficult feelings is not a partner. She does not need another provider. She needs someone who can hold space when things get dark.',
            mood: 'melancholic → empowering',
        },
        hisLens: {
            title: 'Everything Except Desire',
            category: 'emotional-availability',
            premise: 'She gave affection, loyalty, domestic stability — everything except genuine desire. He explains that a woman who stays out of comfort, not passion, makes him feel like a utility. He does not need another roommate. He needs someone who actually wants him, not just what he provides.',
            mood: 'melancholic → confrontational',
        },
    },

    // --- Attachment Styles (mirrored) ---
    {
        dynamic: 'The Chase Cycle',
        category: 'attachment',
        herLens: {
            title: 'Why She Chases Avoidants',
            category: 'attachment',
            premise: 'She is magnetically attracted to men who pull away. He explains her nervous system is replaying childhood: Dad was emotionally distant, so distance feels like love. The "butterflies" she feels are actually anxiety — not chemistry.',
            mood: 'passionate → therapeutic',
        },
        hisLens: {
            title: 'Why He Runs From Closeness',
            category: 'attachment',
            premise: 'He sabotages every relationship when it gets serious. She explains his nervous system is replaying childhood: Mom was overbearing or unpredictable, so intimacy triggers shutdown. The "freedom" he craves is actually fear of being engulfed.',
            mood: 'frustrated → vulnerable',
        },
    },

    // --- Loyalty Tests (mirrored) ---
    {
        dynamic: 'The Loyalty Test',
        category: 'loyalty',
        herLens: {
            title: 'Would You Stay If He Lost It All?',
            category: 'loyalty',
            premise: 'He asks: "If I lost my job, money, and status tomorrow — would you stay?" She answers honestly. The uncomfortable truth is that attraction and loyalty are not unconditional. Biology wired her to value competence. Love alone does not pay rent.',
            mood: 'tense → revealing',
        },
        hisLens: {
            title: 'Would You Stay If She Changed?',
            category: 'loyalty',
            premise: 'She asks: "If I gained weight, stopped dressing up, and aged — would you still desire me?" He answers honestly. The uncomfortable truth is that attraction and loyalty are not unconditional. Biology wired him to value youth and vitality. Love alone does not sustain desire.',
            mood: 'tense → revealing',
        },
    },

    // --- Modern Dating (mirrored) ---
    {
        dynamic: 'The Paradox of Choice',
        category: 'modern-dating',
        herLens: {
            title: '100 Matches, Zero Connections',
            category: 'modern-dating',
            premise: 'She has hundreds of matches but feels lonelier than ever. He explains the paradox: abundance of options creates scarcity of commitment. When every swipe could be "the one," no one ever is. She is drowning in attention but starving for intention.',
            mood: 'frustrated → empathetic',
        },
        hisLens: {
            title: '100 Applications, Zero Replies',
            category: 'modern-dating',
            premise: 'He sends thoughtful messages and gets zero replies. She explains the asymmetry: women are overwhelmed by quantity, men are starved of it. His experience of dating apps is invisible to her. Her experience of dating apps is unimaginable to him. Same platform, parallel universes.',
            mood: 'frustrated → empathetic',
        },
    },

    // --- Situationship (mirrored) ---
    {
        dynamic: 'Situationship Games',
        category: 'modern-dating',
        herLens: {
            title: 'Why He Won\'t Commit',
            category: 'modern-dating',
            premise: 'They have been "talking" for 6 months without labels. She wants clarity. He argues that labels kill organic growth — but she knows that "going with the flow" is code for "keeping options open." His flexibility is her instability.',
            mood: 'passive-aggressive → confrontational',
        },
        hisLens: {
            title: 'Why She Keeps Him Orbiting',
            category: 'modern-dating',
            premise: 'She keeps him emotionally invested without committing. She texts enough to keep hope alive but never enough to confirm anything. He calls it breadcrumbing. She calls it being careful. His investment is her validation — and she is collecting it like currency.',
            mood: 'sarcastic → brutally honest',
        },
    },
];

/**
 * Flattened topic library for backward compatibility.
 */
const TOPIC_LIBRARY: ScenarioTopic[] = PAIRED_LIBRARY.flatMap(pair => [
    pair.herLens,
    pair.hisLens,
]);

/**
 * Returns a random scenario pair for dual-perspective reels.
 */
export function getRandomPair(): ScenarioPair {
    const index = Math.floor(Math.random() * PAIRED_LIBRARY.length);
    return PAIRED_LIBRARY[index];
}

/**
 * Returns a pair matching the given dynamic name, or random if not found.
 */
export function getPairByDynamic(dynamic: string): ScenarioPair {
    const found = PAIRED_LIBRARY.find(
        p => p.dynamic.toLowerCase() === dynamic.toLowerCase()
    );
    return found || getRandomPair();
}

/**
 * Returns a random single scenario topic.
 */
export function getRandomTopic(): ScenarioTopic {
    const index = Math.floor(Math.random() * TOPIC_LIBRARY.length);
    return TOPIC_LIBRARY[index];
}

/**
 * Returns a topic matching the given title (case-insensitive), or a random one.
 */
export function getTopicByTitle(title: string): ScenarioTopic {
    const found = TOPIC_LIBRARY.find(
        t => t.title.toLowerCase() === title.toLowerCase()
    );
    return found || getRandomTopic();
}

/**
 * Returns all topics in a specific category.
 */
export function getTopicsByCategory(category: string): ScenarioTopic[] {
    return TOPIC_LIBRARY.filter(t => t.category === category);
}

/**
 * Returns all available categories.
 */
export function getCategories(): string[] {
    return [...new Set(TOPIC_LIBRARY.map(t => t.category))];
}

/**
 * Returns the full topic library.
 */
export function getAllTopics(): ScenarioTopic[] {
    return [...TOPIC_LIBRARY];
}

/**
 * Returns all paired scenarios.
 */
export function getAllPairs(): ScenarioPair[] {
    return [...PAIRED_LIBRARY];
}
