import {
    CATEGORY_PROMPTS,
    CATEGORY_KEYWORDS,
    CATEGORY_MUSIC_STYLES,
    detectCategoryFromKeywords,
    getPromptTemplate,
    getMusicStyle,
} from '../../../src/infrastructure/llm/CategoryPrompts';
import { BusinessCategory } from '../../../src/domain/entities/WebsitePromo';

describe('CategoryPrompts', () => {
    describe('CATEGORY_PROMPTS', () => {
        it('should have templates for all categories', () => {
            const categories: BusinessCategory[] = ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio'];

            for (const category of categories) {
                expect(CATEGORY_PROMPTS[category]).toBeDefined();
                expect(CATEGORY_PROMPTS[category].hook).toBeTruthy();
                expect(CATEGORY_PROMPTS[category].showcase).toBeTruthy();
                expect(CATEGORY_PROMPTS[category].cta).toBeTruthy();
                expect(CATEGORY_PROMPTS[category].visuals).toBeTruthy();
            }
        });

        it('should have engaging hook questions', () => {
            // Each hook should be a question or attention-grabbing statement
            expect(CATEGORY_PROMPTS.cafe.hook).toContain('?');
            expect(CATEGORY_PROMPTS.gym.hook).toContain('?');
            expect(CATEGORY_PROMPTS.shop.hook).toContain('?');
        });
    });

    describe('CATEGORY_KEYWORDS', () => {
        it('should have keywords for all categories', () => {
            const categories: BusinessCategory[] = ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio'];

            for (const category of categories) {
                expect(CATEGORY_KEYWORDS[category]).toBeDefined();
                expect(CATEGORY_KEYWORDS[category].length).toBeGreaterThan(0);
            }
        });

        it('should have coffee-related keywords for cafe', () => {
            expect(CATEGORY_KEYWORDS.cafe).toContain('coffee');
            expect(CATEGORY_KEYWORDS.cafe).toContain('espresso');
            expect(CATEGORY_KEYWORDS.cafe).toContain('barista');
        });

        it('should have fitness-related keywords for gym', () => {
            expect(CATEGORY_KEYWORDS.gym).toContain('gym');
            expect(CATEGORY_KEYWORDS.gym).toContain('fitness');
            expect(CATEGORY_KEYWORDS.gym).toContain('workout');
        });
    });

    describe('detectCategoryFromKeywords()', () => {
        it('should detect cafe from coffee-related keywords', () => {
            const result = detectCategoryFromKeywords(['coffee', 'espresso', 'barista']);

            expect(result.category).toBe('cafe');
            expect(result.confidence).toBeGreaterThan(0);
        });

        it('should detect gym from fitness-related keywords', () => {
            const result = detectCategoryFromKeywords(['gym', 'fitness', 'training', 'workout']);

            expect(result.category).toBe('gym');
            expect(result.confidence).toBeGreaterThan(0.5);
        });

        it('should detect restaurant from food-related keywords', () => {
            const result = detectCategoryFromKeywords(['restaurant', 'menu', 'chef', 'dining']);

            expect(result.category).toBe('restaurant');
        });

        it('should detect studio from creative keywords', () => {
            const result = detectCategoryFromKeywords(['studio', 'photography', 'creative']);

            expect(result.category).toBe('studio');
        });

        it('should fall back to service for unknown keywords', () => {
            const result = detectCategoryFromKeywords(['unknown', 'random', 'words']);

            expect(result.category).toBe('service');
            expect(result.confidence).toBe(0);
        });

        it('should handle empty keyword array', () => {
            const result = detectCategoryFromKeywords([]);

            expect(result.category).toBe('service');
            expect(result.confidence).toBe(0);
        });

        it('should be case-insensitive', () => {
            const result = detectCategoryFromKeywords(['COFFEE', 'ESPRESSO', 'Barista']);

            expect(result.category).toBe('cafe');
        });

        it('should calculate confidence based on match ratio', () => {
            // All keywords match cafe
            const highConfidence = detectCategoryFromKeywords(['coffee', 'espresso', 'latte']);

            // Mixed keywords
            const lowConfidence = detectCategoryFromKeywords(['coffee', 'gym', 'restaurant']);

            expect(highConfidence.confidence).toBeGreaterThan(lowConfidence.confidence);
        });
    });

    describe('getPromptTemplate()', () => {
        it('should return correct template for cafe', () => {
            const template = getPromptTemplate('cafe');

            expect(template).toBe(CATEGORY_PROMPTS.cafe);
            expect(template.hook).toContain('coffee');
        });

        it('should return correct template for gym', () => {
            const template = getPromptTemplate('gym');

            expect(template).toBe(CATEGORY_PROMPTS.gym);
            expect(template.hook.toLowerCase()).toContain('fitness');
        });
    });

    describe('getMusicStyle()', () => {
        it('should return music style for each category', () => {
            expect(getMusicStyle('cafe')).toBe('warm-acoustic-local');
            expect(getMusicStyle('gym')).toBe('energetic-motivational');
            expect(getMusicStyle('restaurant')).toBe('berlin-techno-minimal');
        });

        it('should have music styles for all categories', () => {
            const categories: BusinessCategory[] = ['cafe', 'gym', 'shop', 'service', 'restaurant', 'studio'];

            for (const category of categories) {
                expect(getMusicStyle(category)).toBeTruthy();
            }
        });
    });
});
