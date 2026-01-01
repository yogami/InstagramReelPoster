/**
 * Website Promo Slice Unit Tests
 * 
 * Tests the core slice functionality in isolation using mocks.
 */

import { WebsitePromoOrchestrator, PromoJob } from '../../../src/slices/website-promo/application/WebsitePromoOrchestrator';
import { WebsitePromoUseCase } from '../../../src/slices/website-promo/application/WebsitePromoUseCase';
import { BlueprintFactory } from '../../../src/slices/website-promo/domain/services/BlueprintFactory';
import { createWebsitePromoSlice } from '../../../src/slices/website-promo';
import { IScrapingPort } from '../../../src/slices/website-promo/ports/IScrapingPort';
import { IScriptGenerationPort } from '../../../src/slices/website-promo/ports/IScriptGenerationPort';
import { IAssetGenerationPort } from '../../../src/slices/website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../../../src/slices/website-promo/ports/IRenderingPort';

describe('Website Promo Slice', () => {
    describe('BlueprintFactory', () => {
        const factory = new BlueprintFactory();

        it('creates restaurant beats for restaurant category', () => {
            const analysis = {
                heroText: 'Best Italian in Berlin',
                metaDescription: 'Authentic Italian cuisine',
                keywords: ['pasta', 'pizza'],
                sourceUrl: 'https://restaurant.com'
            };

            const blueprint = factory.create(analysis, 'restaurant');

            expect(blueprint.beats.length).toBeGreaterThan(0);
            expect(blueprint.beats[0].kind).toBe('HOOK');
            expect(blueprint.totalDuration).toBeGreaterThan(0);
        });

        it('creates tech beats for tech category', () => {
            const analysis = {
                heroText: 'Automate your workflow',
                metaDescription: 'SaaS tool for developers',
                keywords: ['automation', 'api'],
                sourceUrl: 'https://saas.com'
            };

            const blueprint = factory.create(analysis, 'tech');

            expect(blueprint.beats.some(b => b.style === 'zoom_screenshot')).toBe(true);
        });
    });

    describe('WebsitePromoOrchestrator', () => {
        const mockScrapingPort: IScrapingPort = {
            scrape: jest.fn().mockResolvedValue({
                heroText: 'Test Hero',
                metaDescription: 'Test Description',
                keywords: ['test'],
                sourceUrl: 'https://test.com'
            })
        };

        const mockScriptPort: IScriptGenerationPort = {
            generateScript: jest.fn().mockResolvedValue({
                coreMessage: 'Test message',
                category: 'service',
                businessName: 'Test Business',
                scenes: [
                    { duration: 5, imagePrompt: 'Test', narration: 'Test', subtitle: 'Test', role: 'hook' }
                ],
                musicStyle: 'upbeat',
                caption: 'Test caption',
                compliance: { source: 'public-website', consent: true, scrapedAt: new Date() },
                language: 'en'
            }),
            detectCategory: jest.fn().mockResolvedValue('service')
        };

        const mockAssetPort: IAssetGenerationPort = {
            generateVoiceover: jest.fn().mockResolvedValue({ url: 'https://vo.mp3', durationSeconds: 10 }),
            generateImages: jest.fn().mockResolvedValue(['https://img1.png']),
            selectMusic: jest.fn().mockResolvedValue({ url: 'https://music.mp3', durationSeconds: 30 }),
            generateSubtitles: jest.fn().mockResolvedValue('https://subs.srt')
        };

        const mockRenderingPort: IRenderingPort = {
            render: jest.fn().mockResolvedValue({
                videoUrl: 'https://video.mp4',
                renderId: 'render_123',
                durationSeconds: 15
            })
        };

        it('rejects jobs without consent', async () => {
            const orchestrator = new WebsitePromoOrchestrator({
                scrapingPort: mockScrapingPort,
                scriptPort: mockScriptPort,
                assetPort: mockAssetPort,
                renderingPort: mockRenderingPort
            });

            const job = await orchestrator.processJob('job_1', {
                websiteUrl: 'https://test.com',
                consent: false
            });

            expect(job.status).toBe('failed');
            expect(job.error).toContain('consent');
        });

        it('processes valid jobs successfully', async () => {
            const orchestrator = new WebsitePromoOrchestrator({
                scrapingPort: mockScrapingPort,
                scriptPort: mockScriptPort,
                assetPort: mockAssetPort,
                renderingPort: mockRenderingPort
            });

            const job = await orchestrator.processJob('job_2', {
                websiteUrl: 'https://test.com',
                consent: true
            });

            expect(job.status).toBe('completed');
            expect(job.result?.videoUrl).toBe('https://video.mp4');
            expect(mockScrapingPort.scrape).toHaveBeenCalled();
            expect(mockRenderingPort.render).toHaveBeenCalled();
        });
    });

    describe('createWebsitePromoSlice', () => {
        it('creates a slice with orchestrator', () => {
            const slice = createWebsitePromoSlice({
                scrapingPort: { scrape: jest.fn() },
                scriptPort: { generateScript: jest.fn(), detectCategory: jest.fn() },
                assetPort: {
                    generateVoiceover: jest.fn(),
                    generateImages: jest.fn(),
                    selectMusic: jest.fn(),
                    generateSubtitles: jest.fn()
                },
                renderingPort: { render: jest.fn() }
            });

            expect(slice.orchestrator).toBeDefined();
            expect(typeof slice.orchestrator.processJob).toBe('function');
        });
    });
});
