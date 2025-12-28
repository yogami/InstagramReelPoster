import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { JobManager } from '../../../src/application/JobManager';

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        fishAudioPromoVoiceId: 'promo-voice-123'
    }))
}));

describe('ReelOrchestrator - Website Promo Pipeline', () => {
    let orchestrator: ReelOrchestrator;
    let mockDeps: any;
    let mockJobManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn().mockResolvedValue(null),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        };

        mockDeps = createMockDeps(mockJobManager);
        orchestrator = new ReelOrchestrator(mockDeps);
    });

    describe('scrapeWebsiteForPromo', () => {
        it('should throw if websiteScraperClient is not configured', async () => {
            const depsWithoutScraper = { ...mockDeps, websiteScraperClient: undefined };
            const orchestratorNoScraper = new ReelOrchestrator(depsWithoutScraper);

            await expect(
                (orchestratorNoScraper as any).scrapeWebsiteForPromo('job-1', 'https://example.com')
            ).rejects.toThrow('WebsiteScraperClient is required');
        });

        it('should scrape website and perform semantic analysis', async () => {
            const mockAnalysis = {
                heroText: 'Welcome to our business',
                keywords: ['service', 'quality'],
                scrapedMedia: [],
                detectedBusinessName: 'Acme Corp',
                metaDescription: 'test',
                sourceUrl: 'https://example.com'
            };
            mockDeps.websiteScraperClient.scrapeWebsite.mockResolvedValue(mockAnalysis);

            const result = await (orchestrator as any).scrapeWebsiteForPromo('job-1', 'https://example.com');

            expect(result.heroText).toBe('Welcome to our business');
            expect(mockDeps.websiteScraperClient.scrapeWebsite).toHaveBeenCalledWith(
                'https://example.com',
                expect.objectContaining({ includeSubpages: true })
            );
        });
    });

    describe('detectCategoryForPromo', () => {
        it('should use user-provided category when available', async () => {
            const websiteInput = { websiteUrl: 'https://example.com', category: 'service', consent: true } as any;
            const websiteAnalysis = { heroText: '', keywords: [], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            const result = await (orchestrator as any).detectCategoryForPromo('job-1', websiteInput, websiteAnalysis);

            expect(result).toBe('service');
            expect(mockJobManager.updateJob).toHaveBeenCalledWith('job-1', { businessCategory: 'service' });
        });

        it('should detect category via LLM when available', async () => {
            mockDeps.llmClient.detectBusinessCategory = jest.fn().mockResolvedValue('ecommerce');

            const websiteInput = { websiteUrl: 'https://shop.example.com', consent: true } as any;
            const websiteAnalysis = { heroText: 'Shop now', keywords: ['buy', 'cart'], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            const result = await (orchestrator as any).detectCategoryForPromo('job-1', websiteInput, websiteAnalysis);

            expect(result).toBe('ecommerce');
        });

        it('should fall back to keyword detection when LLM fails', async () => {
            mockDeps.llmClient.detectBusinessCategory = jest.fn().mockRejectedValue(new Error('LLM error'));

            const websiteInput = { websiteUrl: 'https://example.com', consent: true } as any;
            const websiteAnalysis = { heroText: '', keywords: ['service', 'consulting'], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            const result = await (orchestrator as any).detectCategoryForPromo('job-1', websiteInput, websiteAnalysis);

            expect(result).toBe('service');
        });

        it('should use keyword detection when LLM method not available', async () => {
            delete mockDeps.llmClient.detectBusinessCategory;

            const websiteInput = { websiteUrl: 'https://example.com', consent: true } as any;
            const websiteAnalysis = { heroText: '', keywords: ['restaurant', 'food'], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            const result = await (orchestrator as any).detectCategoryForPromo('job-1', websiteInput, websiteAnalysis);

            expect(typeof result).toBe('string');
        });
    });

    describe('generatePromoContent', () => {
        it('should throw if generatePromoScript is not available', async () => {
            delete mockDeps.llmClient.generatePromoScript;

            const websiteInput = { websiteUrl: 'https://example.com', consent: true } as any;
            const websiteAnalysis = { heroText: '', keywords: [], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            await expect(
                (orchestrator as any).generatePromoContent('job-1', websiteInput, websiteAnalysis, 'service')
            ).rejects.toThrow('LlmClient.generatePromoScript is required');
        });

        it('should generate promo script with logo when provided', async () => {
            const mockScript = createMockPromoScript();
            mockDeps.llmClient.generatePromoScript.mockResolvedValue(mockScript);

            const websiteInput = {
                websiteUrl: 'https://example.com',
                logoUrl: 'https://example.com/logo.png',
                logoPosition: 'end',
                consent: true
            } as any;
            const websiteAnalysis = { heroText: '', keywords: [], scrapedMedia: [], metaDescription: '', sourceUrl: '' } as any;

            const result = await (orchestrator as any).generatePromoContent('job-1', websiteInput, websiteAnalysis, 'service');

            expect(result.promoScript.logoUrl).toBe('https://example.com/logo.png');
            expect(result.promoScript.logoPosition).toBe('end');
        });

        it('should use detected business name when not provided', async () => {
            const mockScript = createMockPromoScript();
            mockDeps.llmClient.generatePromoScript.mockResolvedValue(mockScript);

            const websiteInput = { websiteUrl: 'https://example.com', consent: true } as any;
            const websiteAnalysis = {
                heroText: '',
                keywords: [],
                scrapedMedia: [],
                metaDescription: '',
                sourceUrl: '',
                detectedBusinessName: 'Detected Corp'
            } as any;

            const result = await (orchestrator as any).generatePromoContent('job-1', websiteInput, websiteAnalysis, 'service');

            expect(result.businessName).toBe('Detected Corp');
        });
    });

    describe('generateImagesWithPriority', () => {
        it('should use pre-resolved media when available and upload to cloudinary', async () => {
            const segments = [createMockSegment(0)];
            const resolvedMedia = ['https://preresolved.com/image.jpg'];

            const result = await (orchestrator as any).generateImagesWithPriority(segments, resolvedMedia, 'job-1');

            // Pre-resolved non-cloudinary URLs get uploaded to cloudinary
            expect(result[0].imageUrl).toBe('https://cloudinary.com/image.png');
            expect(mockDeps.primaryImageClient.generateImage).not.toHaveBeenCalled();
        });

        it('should generate AI image when no pre-resolved media', async () => {
            mockDeps.primaryImageClient.generateImage.mockResolvedValue({ imageUrl: 'https://ai.example.com/image.png' });

            const segments = [createMockSegment(0)];
            const resolvedMedia = [null];

            const result = await (orchestrator as any).generateImagesWithPriority(segments, resolvedMedia, 'job-1');

            expect(result[0].imageUrl).toContain('cloudinary.com'); // Uploaded to cloudinary
            expect(mockDeps.primaryImageClient.generateImage).toHaveBeenCalledWith('prompt');
        });

        it('should fall back to fallback client when primary fails', async () => {
            mockDeps.primaryImageClient.generateImage.mockRejectedValue(new Error('Primary failed'));
            mockDeps.fallbackImageClient.generateImage.mockResolvedValue({ imageUrl: 'https://fallback.example.com/image.png' });

            const segments = [createMockSegment(0)];
            const resolvedMedia = [null];

            const result = await (orchestrator as any).generateImagesWithPriority(segments, resolvedMedia, 'job-1');

            expect(mockDeps.fallbackImageClient.generateImage).toHaveBeenCalled();
        });

        it('should use fallback client when primary not available', async () => {
            const depsNoPrimary = { ...mockDeps, primaryImageClient: undefined };
            const orchestratorNoPrimary = new ReelOrchestrator(depsNoPrimary);
            mockDeps.fallbackImageClient.generateImage.mockResolvedValue({ imageUrl: 'https://fallback.example.com/image.png' });

            const segments = [createMockSegment(0)];
            const resolvedMedia = [null];

            const result = await (orchestratorNoPrimary as any).generateImagesWithPriority(segments, resolvedMedia, 'job-1');

            expect(result[0].imageUrl).toBeDefined();
        });

        it('should skip Media upload for already-cloudinary URLs', async () => {
            const segments = [createMockSegment(0)];
            const resolvedMedia = ['https://cloudinary.com/existing.png'];

            await (orchestrator as any).generateImagesWithPriority(segments, resolvedMedia, 'job-1');

            expect(mockDeps.storageClient.uploadImage).not.toHaveBeenCalled();
        });
    });

    describe('convertPromoScenesToSegments', () => {
        it('should convert scenes to segment content format', () => {
            const promoScript = createMockPromoScript();

            const result = (orchestrator as any).convertPromoScenesToSegments(promoScript);

            expect(result).toHaveLength(2);
            expect(result[0].commentary).toBe('Scene 1 narration');
            expect(result[0].imagePrompt).toBe('Scene 1 prompt');
            expect(result[0].caption).toBe('Scene 1 sub');
        });
    });
});

// Helper functions
function createMockDeps(mockJobManager: any) {
    return {
        transcriptionClient: { transcribe: jest.fn() },
        llmClient: {
            planReel: jest.fn(),
            generateSegmentContent: jest.fn(),
            generatePromoScript: jest.fn(),
            detectBusinessCategory: jest.fn()
        },
        ttsClient: {
            synthesize: jest.fn().mockResolvedValue({ audioUrl: 'https://tts.example.com/audio.mp3', durationSeconds: 30 })
        },
        fallbackTtsClient: { synthesize: jest.fn() },
        primaryImageClient: { generateImage: jest.fn().mockResolvedValue({ imageUrl: 'https://ai.example.com/image.png' }) },
        fallbackImageClient: { generateImage: jest.fn().mockResolvedValue({ imageUrl: 'https://fallback.example.com/image.png' }) },
        subtitlesClient: { generateSubtitles: jest.fn() },
        videoRenderer: { render: jest.fn().mockResolvedValue({ videoUrl: 'https://video.example.com/final.mp4' }) },
        musicSelector: {
            selectMusic: jest.fn().mockResolvedValue({ track: { audioUrl: 'https://music.example.com/track.mp3', durationSeconds: 30 }, source: 'catalog' })
        },
        jobManager: mockJobManager,
        storageClient: {
            uploadAudio: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/audio.mp3' }),
            uploadImage: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/image.png' }),
            uploadVideo: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/video.mp4' })
        },
        websiteScraperClient: {
            scrapeWebsite: jest.fn().mockResolvedValue({
                heroText: 'Welcome',
                keywords: ['service'],
                scrapedMedia: [],
                detectedBusinessName: 'Test Corp',
                metaDescription: 'test',
                sourceUrl: 'https://example.com'
            })
        },
        callbackToken: 'test-token',
        callbackHeader: 'x-make-apikey'
    };
}

function createMockPromoScript() {
    return {
        coreMessage: 'Welcome to Acme',
        scenes: [
            { narration: 'Scene 1 narration', imagePrompt: 'Scene 1 prompt', subtitle: 'Scene 1 sub', duration: 5, role: 'hook' },
            { narration: 'Scene 2 narration', imagePrompt: 'Scene 2 prompt', subtitle: 'Scene 2 sub', duration: 7, role: 'showcase' }
        ],
        caption: 'Check us out',
        category: 'service',
        businessName: 'Acme Corp',
        musicStyle: 'upbeat',
        compliance: { source: 'public-website' },
        language: 'en'
    };
}

function createMockSegment(index: number) {
    return {
        index,
        startSeconds: index * 5,
        endSeconds: (index + 1) * 5,
        commentary: 'Test commentary',
        imagePrompt: 'prompt',
        caption: 'cap'
    };
}
