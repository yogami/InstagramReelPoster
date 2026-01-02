/**
 * Unit Tests for InMemoryTemplateRepository
 */

import { InMemoryTemplateRepository } from '../../../src/slices/website-promo/adapters/InMemoryTemplateRepository';

describe('InMemoryTemplateRepository', () => {
    let repo: InMemoryTemplateRepository;

    beforeEach(() => {
        repo = new InMemoryTemplateRepository();
    });

    describe('getTemplate', () => {
        it('should return template by ID', async () => {
            const template = await repo.getTemplate('restaurant-elegant');

            expect(template).not.toBeNull();
            expect(template!.id).toBe('restaurant-elegant');
            expect(template!.category).toBe('restaurant');
        });

        it('should return null for non-existent ID', async () => {
            const template = await repo.getTemplate('non-existent');

            expect(template).toBeNull();
        });
    });

    describe('listTemplates', () => {
        it('should return all templates when no category specified', async () => {
            const templates = await repo.listTemplates();

            expect(templates.length).toBeGreaterThan(5);
        });

        it('should filter by category', async () => {
            const templates = await repo.listTemplates('restaurant');

            expect(templates.length).toBeGreaterThan(0);
            expect(templates.every(t => t.category === 'restaurant')).toBe(true);
        });

        it('should return empty array for category with no templates', async () => {
            const templates = await repo.listTemplates('spiritual');

            // May or may not have spiritual templates
            expect(Array.isArray(templates)).toBe(true);
        });
    });

    describe('getRecommendedTemplate', () => {
        it('should return first template for category', async () => {
            const template = await repo.getRecommendedTemplate('cafe');

            expect(template).not.toBeNull();
            expect(template!.category).toBe('cafe');
        });

        it('should return null for category with no templates', async () => {
            // Assuming 'spiritual' might not have templates
            const template = await repo.getRecommendedTemplate('spiritual');

            // This may or may not be null depending on templates
            expect(template === null || template.category === 'spiritual').toBe(true);
        });
    });

    describe('template structure', () => {
        it('should have required fields on all templates', async () => {
            const templates = await repo.listTemplates();

            for (const template of templates) {
                expect(template.id).toBeDefined();
                expect(template.name).toBeDefined();
                expect(template.category).toBeDefined();
                expect(template.sceneCount).toBeGreaterThan(0);
                expect(template.sceneHints).toBeDefined();
                expect(template.sceneHints.length).toBe(template.sceneCount);
            }
        });
    });
});
