/**
 * Website Promo Slice Unit Tests
 * 
 * Tests the core slice functionality in isolation using mocks.
 */

import { describe, it, expect, jest } from '@jest/globals';
import { WebsitePromoOrchestrator } from '../../../src/lib/website-promo/application/WebsitePromoOrchestrator';
import { BlueprintFactory } from '../../../src/lib/website-promo/domain/services/BlueprintFactory';
import { createWebsitePromoSlice } from '../../../src/lib/website-promo';
import { IScrapingPort } from '../../../src/lib/website-promo/ports/IScrapingPort';
import { IScriptGenerationPort } from '../../../src/lib/website-promo/ports/IScriptGenerationPort';
import { IAssetGenerationPort } from '../../../src/lib/website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../../../src/lib/website-promo/ports/IRenderingPort';
import { ITranslationPort } from '../../../src/lib/website-promo/ports/ITranslationPort';
import { ITemplateRepository } from '../../../src/lib/website-promo/ports/ITemplateRepository';
import { ICachePort } from '../../../src/lib/website-promo/ports/ICachePort';
import { IMetricsPort } from '../../../src/lib/website-promo/ports/IMetricsPort';
import { ICompliancePort } from '../../../src/lib/website-promo/ports/ICompliancePort';

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

            const blueprint = factory.create(analysis as any, 'restaurant');

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

            const blueprint = factory.create(analysis as any, 'tech');

            expect(blueprint.beats.some(b => b.style === 'zoom_screenshot')).toBe(true);
        });
    });

    const mockScrapingPort = {
        scrape: jest.fn<IScrapingPort['scrape']>().mockResolvedValue({
            heroText: 'Test Hero',
            metaDescription: 'Test Description',
            keywords: ['test'],
            sourceUrl: 'https://test.com'
        })
    } as unknown as IScrapingPort;

    const mockScriptPort = {
        generateScript: jest.fn<IScriptGenerationPort['generateScript']>().mockResolvedValue({
            coreMessage: 'Test message',
            category: 'service' as any,
            businessName: 'Test Business',
            scenes: [
                { duration: 5, imagePrompt: 'Test', narration: 'Test', subtitle: 'Test', role: 'hook' }
            ],
            musicStyle: 'upbeat',
            caption: 'Test caption',
            compliance: { source: 'public-website', consent: true, scrapedAt: new Date() },
            language: 'en'
        }),
        detectCategory: jest.fn<IScriptGenerationPort['detectCategory']>().mockResolvedValue('service' as any)
    } as unknown as IScriptGenerationPort;

    const mockAssetPort = {
        generateVoiceover: jest.fn<IAssetGenerationPort['generateVoiceover']>().mockResolvedValue({ url: 'https://vo.mp3', durationSeconds: 10 }),
        generateImages: jest.fn<IAssetGenerationPort['generateImages']>().mockResolvedValue(['https://img1.png']),
        selectMusic: jest.fn<IAssetGenerationPort['selectMusic']>().mockResolvedValue({ url: 'https://music.mp3', durationSeconds: 30 }),
        generateSubtitles: jest.fn<IAssetGenerationPort['generateSubtitles']>().mockResolvedValue('https://subs.srt')
    } as unknown as IAssetGenerationPort;

    const mockRenderingPort = {
        render: jest.fn<IRenderingPort['render']>().mockResolvedValue({
            videoUrl: 'https://video.mp4',
            renderId: 'render_123',
            durationSeconds: 15
        })
    } as unknown as IRenderingPort;

    const mockTranslationPort = {
        translate: jest.fn<ITranslationPort['translate']>().mockImplementation((t) => Promise.resolve({ translatedText: String(t) } as any)),
        translateBatch: jest.fn<ITranslationPort['translateBatch']>().mockImplementation((t) => Promise.resolve([{ translatedText: String(t) }] as any))
    } as unknown as ITranslationPort;

    const mockTemplateRepo = {
        getTemplate: jest.fn<ITemplateRepository['getTemplate']>().mockResolvedValue({ id: 'base', name: 'Base' } as any),
        listTemplates: jest.fn<ITemplateRepository['listTemplates']>().mockResolvedValue([]),
        getRecommendedTemplate: jest.fn<ITemplateRepository['getRecommendedTemplate']>().mockResolvedValue({ id: 'base', name: 'Base' } as any)
    } as unknown as ITemplateRepository;

    const mockCachePort = {
        get: jest.fn<ICachePort['get']>().mockResolvedValue(null),
        set: jest.fn<ICachePort['set']>().mockResolvedValue()
    } as unknown as ICachePort;

    const mockMetricsPort = {
        incrementCounter: jest.fn<IMetricsPort['incrementCounter']>(),
        recordDuration: jest.fn<IMetricsPort['recordDuration']>(),
        recordGauge: jest.fn<IMetricsPort['recordGauge']>(),
        recordHistogram: jest.fn<IMetricsPort['recordHistogram']>(),
        startTimer: jest.fn<IMetricsPort['startTimer']>().mockReturnValue(() => { }),
        flush: jest.fn<IMetricsPort['flush']>().mockResolvedValue()
    } as unknown as IMetricsPort;

    const mockCompliancePort = {
        checkScript: jest.fn<ICompliancePort['checkScript']>().mockResolvedValue({ approved: true } as any),
        generateDeletionCertificate: jest.fn<ICompliancePort['generateDeletionCertificate']>().mockResolvedValue('cert'),
        recordProvenance: jest.fn<ICompliancePort['recordProvenance']>().mockResolvedValue('audit-123')
    } as unknown as ICompliancePort;

    const commonDeps = {
        scrapingPort: mockScrapingPort,
        scriptPort: mockScriptPort,
        assetPort: mockAssetPort,
        renderingPort: mockRenderingPort,
        translationPort: mockTranslationPort,
        templateRepository: mockTemplateRepo,
        cachePort: mockCachePort,
        metricsPort: mockMetricsPort,
        compliancePort: mockCompliancePort
    };

    describe('WebsitePromoOrchestrator', () => {
        it('rejects jobs without consent', async () => {
            const orchestrator = new WebsitePromoOrchestrator(commonDeps);

            const job = await orchestrator.processJob('job_1', {
                websiteUrl: 'https://test.com',
                consent: false
            });

            expect(job.status).toBe('failed');
            expect(job.error).toContain('consent');
        });

        it('processes valid jobs successfully', async () => {
            const orchestrator = new WebsitePromoOrchestrator(commonDeps);

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
            const slice = createWebsitePromoSlice(commonDeps);

            expect(slice.orchestrator).toBeDefined();
            expect(typeof slice.orchestrator.processJob).toBe('function');
        });
    });
});
