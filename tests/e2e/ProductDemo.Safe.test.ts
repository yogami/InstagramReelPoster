/**
 * Product Demo Safe E2E Test
 * 
 * VALIDATES:
 * 1. Orchestration logic (Eligibility -> Scraping -> Script -> Recording -> Assets -> Render)
 * 2. Feature Flag adherence (implicit via wiring)
 * 3. Error handling for ineligible sites
 * 
 * COST: $0.00 (Uses Mocks)
 */

import { ProductDemoOrchestrator } from '../../src/lib/product-demo/application/ProductDemoOrchestrator';
import { IAssetGenerationPort } from '../../src/lib/website-promo/ports/IAssetGenerationPort';
import { IRenderingPort } from '../../src/lib/website-promo/ports/IRenderingPort';
import { ConsoleMetricsAdapter } from '../../src/lib/website-promo/adapters/ConsoleMetricsAdapter';
import { InMemoryCacheAdapter } from '../../src/lib/website-promo/adapters/InMemoryCacheAdapter';

describe('Product Demo - Safe Enterprise Validation (0-Cost)', () => {
    let orchestrator: ProductDemoOrchestrator;

    // Mocks
    const mockEligibilityPort = {
        checkEligibility: jest.fn().mockResolvedValue({
            isEligible: true,
            productType: 'saas',
            reason: 'Valid SaaS',
            confidence: 0.95
        })
    };

    const mockProductScraper = {
        scrapeProduct: jest.fn().mockResolvedValue({
            sourceUrl: 'https://linear.app',
            productName: 'Linear',
            features: ['Issue Tracking', 'Cycles'],
            images: [],
            screenshots: [],
            requiresAuth: false
        }),
        captureScreenshots: jest.fn().mockResolvedValue([]),
        extractImages: jest.fn().mockResolvedValue([]),
        findDemoButton: jest.fn().mockResolvedValue({ found: false, type: 'none' })
    };

    const mockGitHubScraper = {
        isValidGitHubUrl: jest.fn().mockReturnValue(true),
        parseRepository: jest.fn().mockResolvedValue({
            repoUrl: 'https://github.com/linear/linear',
            repoName: 'linear',
            topics: ['productivity'],
            techStack: ['react'],
            features: []
        })
    };

    const mockRecorder = {
        recordDemo: jest.fn().mockResolvedValue({
            videoUrl: 'https://cloudinary.com/demo.mp4',
            durationSeconds: 30,
            wasAuthenticated: false,
            success: true
        }),
        canRecordWithoutAuth: jest.fn().mockResolvedValue({ canDemoWithoutAuth: true, authType: 'none' }),
        recordLiveDemo: jest.fn().mockResolvedValue({ videoUrl: 'https://demo.mp4', success: true }),
        extractEmbeddedVideo: jest.fn().mockResolvedValue(null)
    };

    const mockScriptGen = {
        generateScript: jest.fn().mockResolvedValue({
            audienceType: 'investor',
            productName: 'Linear',
            coreMessage: 'The issue tracker you always wanted.',
            hook: 'Meet Linear.',
            body: 'The issue tracker you always wanted.',
            callToAction: 'Try it today.',
            estimatedDurationSeconds: 30, // Correct field name
            scenes: [
                {
                    order: 1,
                    duration: 5,
                    narration: 'Meet Linear.',
                    subtitle: 'Meet Linear.',
                    imagePrompt: 'screenshot of linear interface',
                    role: 'HOOK',
                    visualSource: 'screenshot'
                }
            ],
            fullNarration: 'Meet Linear. The issue tracker you always wanted. Try it today.',
            musicStyle: 'upbeat',
            caption: 'Awesome demo #linear',
            language: 'en'
        }),
        refineProblemStatement: jest.fn().mockResolvedValue('Problem statement'),
        generateSceneNarration: jest.fn().mockResolvedValue('Narration')
    };

    const mockAssetPort: IAssetGenerationPort = {
        generateVoiceover: jest.fn().mockResolvedValue({ url: 'https://voice.mp3', durationSeconds: 30 }),
        generateImages: jest.fn().mockResolvedValue(['https://img.png']),
        generateSubtitles: jest.fn().mockResolvedValue('https://subs.srt'),
        selectMusic: jest.fn().mockResolvedValue({ url: 'https://music.mp3', durationSeconds: 30 })
    };

    const mockRenderingPort: IRenderingPort = {
        render: jest.fn().mockResolvedValue({ videoUrl: 'https://final-video.mp4', durationSeconds: 30 })
    };

    beforeEach(() => {
        orchestrator = new ProductDemoOrchestrator({
            eligibilityPort: mockEligibilityPort,
            productScrapingPort: mockProductScraper,
            githubScrapingPort: mockGitHubScraper,
            demoRecordingPort: mockRecorder,
            scriptGenerationPort: mockScriptGen,
            assetPort: mockAssetPort,
            renderingPort: mockRenderingPort,
            cachePort: new InMemoryCacheAdapter(),
            metricsPort: new ConsoleMetricsAdapter()
        });
    });

    it('should complete a job using the full pipeline with mocks', async () => {
        const result = await orchestrator.processJob('safe_demo_1', {
            productUrl: 'https://linear.app',
            audienceType: 'investor',
            consent: true
        });

        // Debug output if failed
        if (result.status === 'failed') {
            console.error('Job failed with:', result.error);
        }

        expect(result.status).toBe('completed');
        expect(result.result).toBeDefined();
        if (result.result && 'videoUrl' in result.result) {
            expect(result.result.videoUrl).toBe('https://final-video.mp4');
        } else {
            fail('Result should contain videoUrl');
        }

        // Verify flow
        expect(mockEligibilityPort.checkEligibility).toHaveBeenCalledWith('https://linear.app');
        expect(mockProductScraper.scrapeProduct).toHaveBeenCalled();
        expect(mockScriptGen.generateScript).toHaveBeenCalled();
        expect(mockRecorder.recordLiveDemo).toHaveBeenCalled();
        expect(mockRenderingPort.render).toHaveBeenCalled();
    });

    it('should gracefully handle ineligible products', async () => {
        mockEligibilityPort.checkEligibility.mockResolvedValueOnce({
            isEligible: false,
            productType: 'ecommerce',
            reason: 'Not a SaaS',
            confidence: 0.9
        });

        const result = await orchestrator.processJob('ineligible_test_1', {
            productUrl: 'https://amazon.com/shoe',
            audienceType: 'investor',
            consent: true
        });

        expect(result.status).toBe('completed');
        // Type narrowing
        if (result.result && 'eligible' in result.result) {
            expect(result.result.eligible).toBe(false);
            // Allow flexible error message matching
            expect(result.result.error).toMatch(/Not a SaaS|supported|ecommerce/);
        } else {
            fail('Should return ineligibility result');
        }

        // Should NOT proceed to expensive steps
        expect(mockRecorder.recordDemo).not.toHaveBeenCalled();
    });
});
