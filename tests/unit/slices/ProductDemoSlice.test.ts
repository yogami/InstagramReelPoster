/**
 * Product Demo Slice Unit Tests
 * 
 * Tests the core slice functionality in isolation using mocks.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { ProductDemoOrchestrator } from '../../../src/lib/product-demo/application/ProductDemoOrchestrator';
import { DemoBlueprintFactory } from '../../../src/lib/product-demo/domain/services/DemoBlueprintFactory';
import { SaaSClassifier } from '../../../src/lib/product-demo/domain/services/SaaSClassifier';
import { createProductDemoSlice } from '../../../src/lib/product-demo';
import { ISaaSEligibilityPort } from '../../../src/lib/product-demo/ports/ISaaSEligibilityPort';
import { IProductScrapingPort } from '../../../src/lib/product-demo/ports/IProductScrapingPort';
import { IGitHubScrapingPort } from '../../../src/lib/product-demo/ports/IGitHubScrapingPort';
import { IDemoRecordingPort } from '../../../src/lib/product-demo/ports/IDemoRecordingPort';
import { IDemoScriptGenerationPort } from '../../../src/lib/product-demo/ports/IDemoScriptGenerationPort';
import { IAssetGenerationPort } from '../../../src/lib/website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../../../src/lib/website-promo/ports/IRenderingPort';
import { ICachePort } from '../../../src/lib/website-promo/ports/ICachePort';
import { IMetricsPort } from '../../../src/lib/website-promo/ports/IMetricsPort';
import { ProductAnalysis, AudienceType } from '../../../src/lib/product-demo/domain/entities/ProductDemo';

describe('Product Demo Slice', () => {
    describe('SaaSClassifier', () => {
        const classifier = new SaaSClassifier();

        it('builds classification prompt from product analysis', () => {
            const analysis: ProductAnalysis = {
                sourceUrl: 'https://linear.app',
                productName: 'Linear',
                tagline: 'The issue tracking tool you\'ll enjoy using',
                features: ['Issue tracking', 'Project management', 'Roadmaps'],
                images: [],
                screenshots: [],
                requiresAuth: false,
                pricingModel: 'freemium'
            };

            const prompt = classifier.buildPrompt(analysis);

            expect(prompt).toContain('Linear');
            expect(prompt).toContain('Issue tracking');
            expect(prompt).toContain('freemium');
        });

        it('parses valid LLM response', () => {
            const response = JSON.stringify({
                productType: 'saas',
                isEligible: true,
                reason: 'Web-based project management tool',
                confidence: 0.95,
                detectedProblem: 'Complex project tracking',
                requiresAuth: false
            });

            const result = classifier.parseResponse(response);

            expect(result.isEligible).toBe(true);
            expect(result.productType).toBe('saas');
            expect(result.confidence).toBe(0.95);
        });

        it('returns ineligible for non-SaaS products', () => {
            const response = JSON.stringify({
                productType: 'ecommerce',
                isEligible: false,
                reason: 'Online store selling products',
                confidence: 0.88
            });

            const result = classifier.parseResponse(response);

            expect(result.isEligible).toBe(false);
            expect(result.productType).toBe('ecommerce');
        });

        it('creates rejection message for non-eligible products', () => {
            const result = {
                isEligible: false,
                productType: 'ecommerce' as const,
                reason: 'E-commerce store',
                confidence: 0.9
            };

            const message = classifier.createRejectionMessage(result);

            expect(message).toContain('E-commerce');
            expect(message).toContain('not yet supported');
        });
    });

    describe('DemoBlueprintFactory', () => {
        const factory = new DemoBlueprintFactory();

        const mockAnalysis: ProductAnalysis = {
            sourceUrl: 'https://saas.com',
            productName: 'TestSaaS',
            tagline: 'Automate your workflow',
            problemStatement: 'Manual processes are slow',
            solutionStatement: 'AI-powered automation',
            features: ['Automation', 'Integration', 'Analytics'],
            images: [{ url: 'https://img1.png', context: 'hero' }],
            screenshots: ['https://screenshot1.png'],
            requiresAuth: false
        };

        it('creates investor pitch beats', () => {
            const blueprint = factory.create(mockAnalysis, 'investor');

            expect(blueprint.beats.length).toBeGreaterThan(0);
            expect(blueprint.beats[0].kind).toBe('HOOK');
            expect(blueprint.audienceType).toBe('investor');
            expect(blueprint.beats.some(b => b.kind === 'SOCIAL_PROOF')).toBe(true);
        });

        it('creates client pitch beats', () => {
            const blueprint = factory.create(mockAnalysis, 'client');

            expect(blueprint.beats.length).toBeGreaterThan(0);
            expect(blueprint.audienceType).toBe('client');
            expect(blueprint.beats.some(b => b.kind === 'CTA')).toBe(true);
        });

        it('filters out LIVE_DEMO beat when no recording available', () => {
            const blueprint = factory.create(mockAnalysis, 'investor', undefined, false);

            expect(blueprint.beats.some(b => b.kind === 'LIVE_DEMO')).toBe(false);
        });

        it('includes LIVE_DEMO beat when recording available', () => {
            const blueprint = factory.create(mockAnalysis, 'investor', undefined, true);

            expect(blueprint.beats.some(b => b.kind === 'LIVE_DEMO')).toBe(true);
        });

        it('converts blueprint to scenes', () => {
            const blueprint = factory.create(mockAnalysis, 'client');
            const scenes = factory.toScenes(blueprint);

            expect(scenes.length).toBe(blueprint.beats.length);
            expect(scenes[0].order).toBe(1);
            expect(scenes[0].duration).toBeGreaterThan(0);
        });
    });

    // Mock factories to avoid TS issues with jest.fn() typing
    const createMockEligibilityPort = () => ({
        checkEligibility: jest.fn().mockImplementation(() => Promise.resolve({
            isEligible: true,
            productType: 'saas',
            reason: 'Valid SaaS product',
            confidence: 0.95
        }))
    });

    const createMockProductScrapingPort = () => ({
        scrapeProduct: jest.fn().mockImplementation(() => Promise.resolve({
            sourceUrl: 'https://test.com',
            productName: 'TestProduct',
            tagline: 'Test tagline',
            features: ['Feature 1'],
            images: [],
            screenshots: ['https://screenshot.png'],
            requiresAuth: false
        })),
        captureScreenshots: jest.fn().mockImplementation(() => Promise.resolve(['https://screenshot.png'])),
        extractImages: jest.fn().mockImplementation(() => Promise.resolve([])),
        findDemoButton: jest.fn().mockImplementation(() => Promise.resolve(null))
    });

    const createMockGitHubScrapingPort = () => ({
        parseRepository: jest.fn().mockImplementation(() => Promise.resolve({
            repoUrl: 'https://github.com/test/repo',
            repoName: 'repo',
            topics: ['saas'],
            techStack: ['typescript'],
            features: []
        })),
        isValidGitHubUrl: jest.fn().mockReturnValue(true)
    });

    const createMockDemoRecordingPort = () => ({
        canRecordWithoutAuth: jest.fn().mockImplementation(() => Promise.resolve({
            canDemoWithoutAuth: false,
            authType: 'login'
        })),
        recordLiveDemo: jest.fn().mockImplementation(() => Promise.resolve({ success: false })),
        extractEmbeddedVideo: jest.fn().mockImplementation(() => Promise.resolve(null))
    });

    const createMockScriptGenerationPort = () => ({
        generateScript: jest.fn().mockImplementation(() => Promise.resolve({
            audienceType: 'investor' as AudienceType,
            productName: 'TestProduct',
            coreMessage: 'Test message',
            scenes: [
                { order: 1, duration: 5, narration: 'Test', subtitle: 'Test', imagePrompt: 'Test', role: 'HOOK' as any, visualSource: 'generated' as any }
            ],
            fullNarration: 'Test narration',
            estimatedDurationSeconds: 30,
            musicStyle: 'upbeat',
            caption: 'Test caption',
            language: 'en'
        })),
        refineProblemStatement: jest.fn().mockImplementation(() => Promise.resolve('Test problem')),
        generateSceneNarration: jest.fn().mockImplementation(() => Promise.resolve('Test narration'))
    });

    const createMockAssetPort = () => ({
        generateVoiceover: jest.fn().mockImplementation(() => Promise.resolve({ url: 'https://vo.mp3', durationSeconds: 10 })),
        generateImages: jest.fn().mockImplementation(() => Promise.resolve(['https://img1.png'])),
        selectMusic: jest.fn().mockImplementation(() => Promise.resolve({ url: 'https://music.mp3', durationSeconds: 30 })),
        generateSubtitles: jest.fn().mockImplementation(() => Promise.resolve('https://subs.srt'))
    });

    const createMockRenderingPort = () => ({
        render: jest.fn().mockImplementation(() => Promise.resolve({
            videoUrl: 'https://video.mp4',
            renderId: 'render_123',
            durationSeconds: 30
        }))
    });

    const createMockCachePort = () => ({
        get: jest.fn().mockImplementation(() => Promise.resolve(null)),
        set: jest.fn().mockImplementation(() => Promise.resolve(undefined))
    });

    const createMockMetricsPort = () => ({
        incrementCounter: jest.fn(),
        recordDuration: jest.fn(),
        recordGauge: jest.fn(),
        recordHistogram: jest.fn(),
        startTimer: jest.fn().mockReturnValue(() => { }),
        flush: jest.fn().mockImplementation(() => Promise.resolve(undefined))
    });

    const createCommonDeps = () => ({
        eligibilityPort: createMockEligibilityPort() as any,
        productScrapingPort: createMockProductScrapingPort() as any,
        githubScrapingPort: createMockGitHubScrapingPort() as any,
        demoRecordingPort: createMockDemoRecordingPort() as any,
        scriptGenerationPort: createMockScriptGenerationPort() as any,
        assetPort: createMockAssetPort() as any,
        renderingPort: createMockRenderingPort() as any,
        cachePort: createMockCachePort() as any,
        metricsPort: createMockMetricsPort() as any
    });

    describe('ProductDemoOrchestrator', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('rejects jobs without consent', async () => {
            const orchestrator = new ProductDemoOrchestrator(createCommonDeps());

            const job = await orchestrator.processJob('job_1', {
                productUrl: 'https://test.com',
                audienceType: 'investor',
                consent: false
            });

            expect(job.status).toBe('failed');
            expect(job.error).toContain('consent');
        });

        it('rejects non-eligible URLs', async () => {
            const deps = createCommonDeps();
            (deps.eligibilityPort.checkEligibility as jest.Mock).mockImplementation(() => Promise.resolve({
                isEligible: false,
                productType: 'ecommerce',
                reason: 'E-commerce site',
                confidence: 0.9
            }));

            const orchestrator = new ProductDemoOrchestrator(deps);

            const job = await orchestrator.processJob('job_2', {
                productUrl: 'https://amazon.com',
                audienceType: 'investor',
                consent: true
            });

            expect(job.status).toBe('completed');
            expect(job.result).toHaveProperty('eligible', false);
        });

        it('processes valid SaaS URLs successfully', async () => {
            const deps = createCommonDeps();
            const orchestrator = new ProductDemoOrchestrator(deps);

            const job = await orchestrator.processJob('job_3', {
                productUrl: 'https://linear.app',
                audienceType: 'investor',
                consent: true
            });

            expect(job.status).toBe('completed');
            expect(job.result).toHaveProperty('videoUrl');
            expect(deps.productScrapingPort.scrapeProduct).toHaveBeenCalled();
            expect(deps.renderingPort.render).toHaveBeenCalled();
        });

        it('checks eligibility correctly', async () => {
            const deps = createCommonDeps();
            const orchestrator = new ProductDemoOrchestrator(deps);

            const result = await orchestrator.checkEligibility('https://linear.app');

            expect(result.eligible).toBe(true);
            expect(deps.eligibilityPort.checkEligibility).toHaveBeenCalledWith('https://linear.app');
        });
    });

    describe('createProductDemoSlice', () => {
        it('creates a slice with orchestrator', () => {
            const slice = createProductDemoSlice(createCommonDeps());

            expect(slice.orchestrator).toBeDefined();
            expect(typeof slice.orchestrator.processJob).toBe('function');
            expect(typeof slice.orchestrator.checkEligibility).toBe('function');
        });
    });
});
