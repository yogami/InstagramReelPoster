
import { detectCategoryFromKeywords, CATEGORY_KEYWORDS } from '../../../src/infrastructure/llm/CategoryPrompts';
import { BusinessCategory } from '../../../src/domain/entities/WebsitePromo';

describe('CategoryPrompts Detection Logic', () => {
    it('should detect "tech" category for AI/software keywords', () => {
        const keywords = ['AI', 'solutions', 'software', 'engineering', 'platform'];
        const result = detectCategoryFromKeywords(keywords);
        expect(result.category).toBe('tech');
        expect(result.confidence).toBeGreaterThan(0);
    });

    it('should detect "agency" category for marketing/strategy keywords', () => {
        const keywords = ['marketing', 'digital', 'strategy', 'growth', 'consulting'];
        const result = detectCategoryFromKeywords(keywords);
        expect(result.category).toBe('agency');
        expect(result.confidence).toBeGreaterThan(0);
    });

    it('should default to "service" for generic professional keywords if no better match', () => {
        const keywords = ['professional', 'expert', 'quality', 'trusted'];
        const result = detectCategoryFromKeywords(keywords);
        expect(result.category).toBe('service');
    });

    it('should correctly prioritize "restaurant" for dining keywords', () => {
        const keywords = ['menu', 'dinner', 'delicious', 'dining', 'wine'];
        const result = detectCategoryFromKeywords(keywords);
        expect(result.category).toBe('restaurant');
    });

    it('should handle mixed keywords by score', () => {
        // More tech keywords than agency keywords
        const keywords = ['AI', 'software', 'tech', 'marketing'];
        const result = detectCategoryFromKeywords(keywords);
        expect(result.category).toBe('tech');
    });
});
