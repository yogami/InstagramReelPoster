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
};

/**
 * Music styles for each business category.
 */
export const CATEGORY_MUSIC_STYLES: Record<BusinessCategory, string> = {
    cafe: 'warm-acoustic-local',
    gym: 'energetic-motivational',
    shop: 'upbeat-indie',
    service: 'professional-ambient',
    restaurant: 'sophisticated-lounge',
    studio: 'creative-electronic',
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
