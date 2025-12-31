import { BusinessCategory, CategoryPromptTemplate } from '../../domain/entities/WebsitePromo';

/**
 * Category-specific prompt templates for website promo reels.
 * Each category has optimized hook, showcase, CTA, and visual keywords.
 */
export const CATEGORY_PROMPTS: Record<BusinessCategory, CategoryPromptTemplate> = {
    cafe: {
        hook: "Struggling with boring coffee mornings?",
        showcase: "Fresh local roasts, cozy vibe, perfect lattes",
        cta: "Your daily Berlin ritual starts here",
        visuals: "steaming cups, barista hands, cozy interiors, pastries, warm morning light",
    },
    gym: {
        hook: "Fitness plateaus killing your gains?",
        showcase: "Expert coaching, modern equipment, community energy",
        cta: "Transform with Berlin's strongest gym",
        visuals: "lifting weights, group classes, determination, progress shots, energetic atmosphere",
    },
    shop: {
        hook: "Need unique gifts that actually impress?",
        showcase: "Curated local makers, exclusive finds, perfect packaging",
        cta: "Shop local excellence in Berlin",
        visuals: "product closeups, store interior, wrapped gifts, owner smiling, boutique vibes",
    },
    service: {
        hook: "Wasting time on unreliable providers?",
        showcase: "Reliable, local, 5-star rated experts",
        cta: "Book Berlin's trusted professionals",
        visuals: "before/after, tools/equipment, happy clients, professional workspace",
    },
    restaurant: {
        hook: "Craving authentic flavors not tourist traps?",
        showcase: "Chef-crafted dishes, fresh ingredients, warm hospitality",
        cta: "Taste Berlin's hidden culinary gem",
        visuals: "plating food, chef cooking, diners enjoying, wine pours, intimate atmosphere",
    },
    studio: {
        hook: "Your creative spark needs the right space?",
        showcase: "Professional studio, all gear included, inspiring vibe",
        cta: "Create your masterpiece here",
        visuals: "studio setup, artist working, mood lighting, finished work, creative energy",
    },
    spiritual: {
        hook: "Still searching for peace in the noise?",
        showcase: "Ancient wisdom, modern psychology, deep self-inquiry",
        cta: "Start your journey within",
        visuals: "Minimalist zen garden, incense smoke, meditator in silhouette, sacred geometry, morning mist",
    },
    tech: {
        hook: "Is your business stuck in the analog past?",
        showcase: "Cutting-edge AI, future-proof strategy, automated growth",
        cta: "Scale with Berlin's tech leaders",
        visuals: "abstract data streams, glowing neural networks, futuristic clean office, abstract geometric shapes, sleek holographic UI",
    },
    agency: {
        hook: "Stop guessing with your marketing budget.",
        showcase: "Data-driven results, expert strategy, proven growth",
        cta: "Partner with Berlin's growth engine",
        visuals: "modern agency office, strategy whiteboard, analytics dashboard on screen, team brainstorming, high-end macbook setup",
    },
};

/**
 * Keywords used to detect business category from scraped content.
 */
export const CATEGORY_KEYWORDS: Record<BusinessCategory, string[]> = {
    cafe: ['coffee', 'cafe', 'café', 'espresso', 'latte', 'cappuccino', 'barista', 'roast', 'brew', 'bakery'],
    gym: ['gym', 'fitness', 'training', 'workout', 'exercise', 'weights', 'cardio', 'crossfit', 'yoga', 'pilates'],
    shop: ['shop', 'store', 'buy', 'products', 'retail', 'boutique', 'gifts', 'handmade', 'crafts', 'fashion'],
    restaurant: ['restaurant', 'dining', 'menu', 'chef', 'cuisine', 'food', 'dishes', 'kitchen', 'brunch', 'dinner'],
    studio: ['studio', 'creative', 'photography', 'art', 'design', 'recording', 'music', 'dance', 'tattoo'],
    service: ['service', 'professional', 'expert', 'consultation', 'booking', 'appointment', 'therapist', 'consultant'],
    spiritual: ['meditation', 'wellness', 'spiritual', 'healing', 'yoga', 'mindfulness', 'retreat', 'insight', 'wisdom'],
    tech: ['software', 'app', 'platform', 'ai', 'artificial intelligence', 'data', 'cloud', 'digital', 'saas', 'automation', 'tech', 'cyber'],
    agency: ['agency', 'marketing', 'consulting', 'strategy', 'digital', 'branding', 'design', 'growth', 'advertising', 'media'],
};

/**
 * Music styles for each business category.
 */
export const CATEGORY_MUSIC_STYLES: Record<BusinessCategory, string> = {
    cafe: 'warm-acoustic-local',
    gym: 'energetic-motivational',
    shop: 'upbeat-indie',
    service: 'professional-ambient',
    restaurant: 'berlin-techno-minimal',
    studio: 'creative-electronic',
    spiritual: 'deep-ambient-flute-sitar',
    tech: 'tech', // Updated to match 'tech' tag in catalog
    agency: 'modern-corporate-upbeat',
};

/**
 * Detects business category from keywords using a simple scoring system.
 * @param keywords Array of keywords extracted from website
 * @returns Detected category with confidence, or 'service' as fallback
 */
export function detectCategoryFromKeywords(keywords: string[]): {
    category: BusinessCategory;
    confidence: number;
} {
    const scores: Record<BusinessCategory, number> = {
        cafe: 0,
        gym: 0,
        shop: 0,
        service: 0,
        restaurant: 0,
        studio: 0,
        spiritual: 0,
        tech: 0,
        agency: 0,
    };

    const normalizedKeywords = keywords.map(kw => kw.toLowerCase());

    for (const [category, categoryKeywords] of Object.entries(CATEGORY_KEYWORDS)) {
        for (const kw of categoryKeywords) {
            if (normalizedKeywords.includes(kw)) {
                scores[category as BusinessCategory]++;
            }
        }
    }

    // Find category with highest score
    let bestCategory: BusinessCategory = 'service';
    let bestScore = 0;

    for (const [category, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestCategory = category as BusinessCategory;
        }
    }

    // Calculate confidence (0-1)
    const totalMatches = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = totalMatches > 0 ? bestScore / totalMatches : 0;

    return { category: bestCategory, confidence };
}

/**
 * Structure of a viral psychological hook.
 */
export interface ViralHook {
    id: string;
    name: string;
    description: string;
    structureInstruction: string;
    visualInstruction: string;
}

/**
 * "Nuclear ReelBerlin" Viral Hooks.
 * 5 psychological triggers to minimize skip rate.
 */
export const VIRAL_HOOKS: ViralHook[] = [
    {
        id: 'curiosity-gap',
        name: 'The Curiosity Gap',
        description: 'Open a loop that the viewer MUST watch to close. (Zeigefinger Effect)',
        structureInstruction: '1. CURIOSITY HOOK (4s): Start with a specific statement about what makes this place different, but DO NOT reveal the answer immediately. "Why THIS [business type] beats the others..."',
        visualInstruction: 'Visual: A normal scene that SUDDENLY freezes or zooms in on a detail, creating a "Wait, what?" moment. No text.'
    },
    {
        id: 'pattern-interrupt',
        name: 'Pattern Interrupt',
        description: 'Startle the brain with immediate sensory dissonance.',
        structureInstruction: '1. PATTERN INTERRUPT (3s): Immediate visual/audio shock. A sudden cloud of steam, a slam on the counter, or a dissonant chord resolving to harmony.',
        visualInstruction: 'Visual: SUDDEN steam explosion from cup OR barista hand SLAMS counter. High contrast movement.'
    },
    {
        id: 'underdog-reversal',
        name: 'Underdog Reversal',
        description: 'The hero s journey pattern: Failure -> Success.',
        structureInstruction: '1. UNDERDOG HOOK (5s): Show a relatable failure followed by mastery. "Failed 3x -> THIS pour changed everything."',
        visualInstruction: 'Visual: A split screen or sequence: "Burnt batch / Spilled milk" (FAIL) -> "Perfect roast / Latte art" (WIN).'
    },
    {
        id: 'social-proof-friction',
        name: 'Social Proof Friction',
        description: 'Challenge the viewer to judge standard vs. excellence.',
        structureInstruction: '1. JUDGMENT HOOK (4s): Pause the scroll with a challenge. "Swipe if you settle for average. Stay if you want Berlin\'s best."',
        visualInstruction: 'Visual: A split screen comparing "average" vs "excellence". High contrast.'
    },
    {
        id: 'fomo-loop',
        name: 'The FOMO Loop',
        description: 'Urgency + seamless looping mechanism.',
        structureInstruction: '1. FOMO HOOK (4s): Immediate scarcity. "Limited capacity..." or "Offer ends soon..."',
        visualInstruction: 'Visual: High urgency movement, hourglass sand running out, or busy scene. No text.'
    }
];

/**
 * Selects a random viral hook strategy.
 */
export function getRandomViralHook(): ViralHook {
    const randomIndex = Math.floor(Math.random() * VIRAL_HOOKS.length);
    return VIRAL_HOOKS[randomIndex];
}

/**
 * Gets the display name of a viral hook by its ID.
 */
export function getViralHookName(id?: string): string {
    if (!id) return 'Standard Promo';
    const hook = VIRAL_HOOKS.find(h => h.id === id);
    return hook ? hook.name : 'Custom Strategy';
}

/**
 * Gets the prompt template for a given category.
 */
export function getPromptTemplate(category: BusinessCategory): CategoryPromptTemplate {
    return CATEGORY_PROMPTS[category];
}

/**
 * Gets the music style for a given category.
 */
export function getMusicStyle(category: BusinessCategory): string {
    return CATEGORY_MUSIC_STYLES[category];
}
