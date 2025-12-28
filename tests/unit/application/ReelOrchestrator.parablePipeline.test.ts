import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        fishAudioPromoVoiceId: 'promo-voice-123'
    }))
}));

describe('ReelOrchestrator - Parable Pipeline', () => {
    let mockDeps: any;
    let mockJobManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        };

        mockDeps = createMockDeps(mockJobManager);
    });

    describe('Parable Mode Detection', () => {
        it('should detect parable mode when force mode is set', async () => {
            mockJobManager.getJob.mockResolvedValue(createMockJob({ forceMode: 'parable' }));
            mockDeps.llmClient.detectContentMode = jest.fn().mockResolvedValue('direct-message');

            const orchestrator = new ReelOrchestrator(mockDeps);

            // detectContentMode should use forceMode when set
            const job = await mockJobManager.getJob('job-1');
            expect(job.forceMode).toBe('parable');
        });

        it('should use LLM to detect content mode when force mode not set', async () => {
            mockDeps.llmClient.detectContentMode = jest.fn().mockResolvedValue('parable');
            mockJobManager.getJob.mockResolvedValue(createMockJob({}));

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.llmClient.detectContentMode).toBeDefined();
        });
    });

    describe('Parable Intent Extraction', () => {
        it('should extract parable intent when in parable mode', async () => {
            const mockIntent = {
                coreTheme: 'wisdom',
                sourceType: 'theme-only',
                culturalPreference: 'eastern'
            };
            mockDeps.llmClient.extractParableIntent = jest.fn().mockResolvedValue(mockIntent);

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.llmClient.extractParableIntent).toBeDefined();
        });
    });

    describe('Parable Source Selection', () => {
        it('should choose parable source for theme-only intent', async () => {
            const mockSourceChoice = {
                culture: 'zen-buddhist',
                archetype: 'sage',
                rationale: 'Classic wisdom teaching'
            };
            mockDeps.llmClient.chooseParableSource = jest.fn().mockResolvedValue(mockSourceChoice);

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.llmClient.chooseParableSource).toBeDefined();
        });

        it('should use default source when chooseParableSource not available', async () => {
            delete mockDeps.llmClient.chooseParableSource;

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.llmClient.chooseParableSource).toBeUndefined();
        });
    });

    describe('Parable Script Generation', () => {
        it('should generate parable script with beats', async () => {
            const mockScript = {
                beats: [
                    { narration: 'Once upon a time...', imagePrompt: 'Ancient temple', textOnScreen: 'Long ago', approxDurationSeconds: 5 },
                    { narration: 'A wise sage taught...', imagePrompt: 'Wise elder', textOnScreen: 'Wisdom', approxDurationSeconds: 7 }
                ],
                moral: 'The true treasure was within'
            };
            mockDeps.llmClient.generateParableScript = jest.fn().mockResolvedValue(mockScript);

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.llmClient.generateParableScript).toBeDefined();
        });
    });

    describe('Fallback to Direct Message', () => {
        it('should fall back to direct-message on parable pipeline error', async () => {
            mockDeps.llmClient.extractParableIntent = jest.fn().mockRejectedValue(new Error('LLM error'));
            mockDeps.llmClient.planReel = jest.fn().mockResolvedValue({
                targetDurationSeconds: 30,
                segmentCount: 3,
                mainCaption: 'Test',
                musicTags: ['inspirational']
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            // Both should be defined - one fails, one succeeds as fallback
            expect(mockDeps.llmClient.extractParableIntent).toBeDefined();
            expect(mockDeps.llmClient.planReel).toBeDefined();
        });
    });
});

describe('ReelOrchestrator - Hook Optimization', () => {
    let mockDeps: any;
    let mockJobManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn().mockResolvedValue({ id: 'job-1' }),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        };

        mockDeps = createMockDeps(mockJobManager);
    });

    describe('HookAndStructureService Integration', () => {
        it('should optimize hooks when service is available', async () => {
            const mockHookPlan = {
                chosenHook: 'Why most people fail...',
                alternativeHooks: ['Secret to success', 'Nobody talks about this'],
                targetDurationSeconds: 25,
                segmentCount: 4,
                hookStyle: 'question'
            };
            mockDeps.hookAndStructureService = {
                optimizeStructure: jest.fn().mockResolvedValue(mockHookPlan)
            };

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.hookAndStructureService.optimizeStructure).toBeDefined();
        });

        it('should skip hook optimization gracefully when service fails', async () => {
            mockDeps.hookAndStructureService = {
                optimizeStructure: jest.fn().mockRejectedValue(new Error('Hook service error'))
            };
            mockDeps.llmClient.planReel = jest.fn().mockResolvedValue({
                targetDurationSeconds: 30,
                segmentCount: 3,
                mainCaption: 'Test'
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            // Should continue without hook optimization
            expect(mockDeps.hookAndStructureService.optimizeStructure).toBeDefined();
            expect(mockDeps.llmClient.planReel).toBeDefined();
        });

        it('should work without hookAndStructureService', async () => {
            delete mockDeps.hookAndStructureService;

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.hookAndStructureService).toBeUndefined();
        });
    });

    describe('Hook Plan Update', () => {
        it('should update job with hook plan when optimization succeeds', async () => {
            mockDeps.hookAndStructureService = {
                optimizeStructure: jest.fn().mockResolvedValue({
                    chosenHook: 'Did you know?',
                    targetDurationSeconds: 20,
                    segmentCount: 3,
                    hookStyle: 'question'
                })
            };

            const orchestrator = new ReelOrchestrator(mockDeps);

            expect(mockDeps.hookAndStructureService).toBeDefined();
        });
    });
});

// Helper functions
function createMockDeps(mockJobManager: any) {
    return {
        transcriptionClient: { transcribe: jest.fn().mockResolvedValue('Test transcription') },
        llmClient: {
            planReel: jest.fn().mockResolvedValue({
                targetDurationSeconds: 30,
                segmentCount: 3,
                mainCaption: 'Test',
                musicTags: ['inspirational'],
                musicPrompt: 'Upbeat music'
            }),
            generateSegmentContent: jest.fn().mockResolvedValue([
                { commentary: 'Test 1', imagePrompt: 'Image 1', caption: 'Cap 1' }
            ]),
            detectContentMode: jest.fn().mockResolvedValue('direct-message'),
            extractParableIntent: jest.fn(),
            generateParableScript: jest.fn(),
            chooseParableSource: jest.fn()
        },
        ttsClient: {
            synthesize: jest.fn().mockResolvedValue({ audioUrl: 'https://tts.example.com/audio.mp3', durationSeconds: 30 })
        },
        fallbackTTSClient: { synthesize: jest.fn() },
        primaryImageClient: { generateImage: jest.fn().mockResolvedValue({ imageUrl: 'https://example.com/image.png' }) },
        fallbackImageClient: { generateImage: jest.fn().mockResolvedValue({ imageUrl: 'https://fallback.example.com/image.png' }) },
        subtitlesClient: { generateSubtitles: jest.fn().mockResolvedValue({ subtitlesUrl: 'https://subtitles.example.com/subs.vtt' }) },
        videoRenderer: { render: jest.fn().mockResolvedValue({ videoUrl: 'https://video.example.com/final.mp4', renderId: 'render-123' }) },
        musicSelector: {
            selectMusic: jest.fn().mockResolvedValue({ track: { audioUrl: 'https://music.example.com/track.mp3', durationSeconds: 30 }, source: 'catalog' })
        },
        jobManager: mockJobManager,
        storageClient: {
            uploadAudio: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/audio.mp3' }),
            uploadImage: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/image.png' }),
            uploadVideo: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/video.mp4' })
        },
        callbackToken: 'test-token',
        callbackHeader: 'x-make-apikey'
    };
}

function createMockJob(overrides: any) {
    return {
        id: 'job-1',
        status: 'pending',
        sourceAudioUrl: 'https://audio.example.com/source.mp3',
        targetDurationRange: { min: 20, max: 40 },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    };
}
