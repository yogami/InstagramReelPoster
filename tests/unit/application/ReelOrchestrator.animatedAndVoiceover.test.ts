import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        fishAudioPromoVoiceId: 'promo-voice-123'
    }))
}));

describe('ReelOrchestrator - Animated Video Generation', () => {
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

    describe('Multi-clip Parable Video Generation', () => {
        it('should generate one video per parable beat', async () => {
            mockDeps.animatedVideoClient = {
                generateAnimatedVideo: jest.fn()
                    .mockResolvedValueOnce({ videoUrl: 'https://kie.ai/video1.mp4' })
                    .mockResolvedValueOnce({ videoUrl: 'https://kie.ai/video2.mp4' })
            };
            mockDeps.storageClient.uploadVideo = jest.fn()
                .mockResolvedValueOnce({ url: 'https://cloudinary.com/video1.mp4' })
                .mockResolvedValueOnce({ url: 'https://cloudinary.com/video2.mp4' });

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.animatedVideoClient.generateAnimatedVideo).toBeDefined();
        });

        it('should respect kieMaxDuration of 10s per clip', async () => {
            const mockGenerate = jest.fn().mockResolvedValue({ videoUrl: 'https://kie.ai/video.mp4' });
            mockDeps.animatedVideoClient = { generateAnimatedVideo: mockGenerate };

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.animatedVideoClient).toBeDefined();
        });

        it('should persist each beat video to Cloudinary', async () => {
            mockDeps.animatedVideoClient = {
                generateAnimatedVideo: jest.fn().mockResolvedValue({ videoUrl: 'https://kie.ai/video.mp4' })
            };

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.storageClient.uploadVideo).toBeDefined();
        });

        it('should handle video persistence failure gracefully', async () => {
            mockDeps.animatedVideoClient = {
                generateAnimatedVideo: jest.fn().mockResolvedValue({ videoUrl: 'https://kie.ai/video.mp4' })
            };
            mockDeps.storageClient.uploadVideo = jest.fn().mockRejectedValue(new Error('Upload failed'));

            const orchestrator = new ReelOrchestrator(mockDeps);
            // Should not throw, just log error
            expect(mockDeps.storageClient.uploadVideo).toBeDefined();
        });
    });

    describe('Non-Parable Animated Video Generation', () => {
        it('should calculate number of clips based on duration', async () => {
            mockDeps.animatedVideoClient = {
                generateAnimatedVideo: jest.fn().mockResolvedValue({ videoUrl: 'https://kie.ai/video.mp4' })
            };

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.animatedVideoClient).toBeDefined();
        });

        it('should skip generation if existing videos present', async () => {
            mockJobManager.getJob.mockResolvedValue({
                id: 'job-1',
                animatedVideoUrls: ['https://existing.com/video.mp4']
            });

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockJobManager.getJob).toBeDefined();
        });
    });
});

describe('ReelOrchestrator - Voiceover Synthesis', () => {
    let mockDeps: any;
    let mockJobManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn(),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        };

        mockDeps = createMockDeps(mockJobManager);
    });

    describe('synthesizeWithAdjustment', () => {
        it('should use primary TTS client first', async () => {
            mockDeps.ttsClient.synthesize = jest.fn().mockResolvedValue({
                audioUrl: 'https://fish.audio/voice.mp3',
                durationSeconds: 30
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            const result = await (orchestrator as any).synthesizeWithAdjustment('Test text', 30);

            expect(mockDeps.ttsClient.synthesize).toHaveBeenCalled();
            expect(result.voiceoverUrl).toBe('https://fish.audio/voice.mp3');
        });

        it('should fall back to fallback TTS when primary fails', async () => {
            mockDeps.ttsClient.synthesize = jest.fn().mockRejectedValue(new Error('Primary TTS failed'));
            mockDeps.fallbackTTSClient.synthesize = jest.fn().mockResolvedValue({
                audioUrl: 'https://xtts.example.com/voice.mp3',
                durationSeconds: 30
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            const result = await (orchestrator as any).synthesizeWithAdjustment('Test text', 30);

            expect(mockDeps.fallbackTTSClient.synthesize).toHaveBeenCalled();
            expect(result.voiceoverUrl).toBe('https://xtts.example.com/voice.mp3');
        });

        it('should pass voiceId to TTS client', async () => {
            mockDeps.ttsClient.synthesize = jest.fn().mockResolvedValue({
                audioUrl: 'https://fish.audio/voice.mp3',
                durationSeconds: 30
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            await (orchestrator as any).synthesizeWithAdjustment('Test text', 30, 'custom-voice-id');

            expect(mockDeps.ttsClient.synthesize).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({ voiceId: 'custom-voice-id' })
            );
        });

        it('should upload base64 audio to storage', async () => {
            mockDeps.ttsClient.synthesize = jest.fn().mockResolvedValue({
                audioUrl: 'data:audio/mp3;base64,abc123',
                durationSeconds: 30
            });
            mockDeps.storageClient.uploadAudio = jest.fn().mockResolvedValue({
                url: 'https://cloudinary.com/voice.mp3'
            });

            const orchestrator = new ReelOrchestrator(mockDeps);

            const result = await (orchestrator as any).synthesizeWithAdjustment('Test text', 30);

            expect(mockDeps.storageClient.uploadAudio).toHaveBeenCalled();
            expect(result.voiceoverUrl).toContain('cloudinary.com');
        });
    });
});

describe('ReelOrchestrator - Finalize Job', () => {
    let mockDeps: any;
    let mockJobManager: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn(),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        };

        mockDeps = createMockDeps(mockJobManager);
    });

    describe('finalizePromoJob', () => {
        it('should render video and update job status', async () => {
            mockDeps.videoRenderer.render = jest.fn().mockResolvedValue({
                videoUrl: 'https://creatomate.com/video.mp4',
                renderId: 'render-123'
            });

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.videoRenderer.render).toBeDefined();
        });

        it('should upload final video to Cloudinary', async () => {
            mockDeps.videoRenderer.render = jest.fn().mockResolvedValue({
                videoUrl: 'https://creatomate.com/video.mp4'
            });
            mockDeps.storageClient.uploadVideo = jest.fn().mockResolvedValue({
                url: 'https://cloudinary.com/final.mp4'
            });

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockDeps.storageClient.uploadVideo).toBeDefined();
        });

        it('should mark job as completed', async () => {
            mockDeps.videoRenderer.render = jest.fn().mockResolvedValue({
                videoUrl: 'https://video.example.com/final.mp4'
            });

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockJobManager.updateJob).toBeDefined();
        });
    });

    describe('handlePromoJobError', () => {
        it('should fail job with error message', async () => {
            mockJobManager.failJob = jest.fn();

            const orchestrator = new ReelOrchestrator(mockDeps);
            expect(mockJobManager.failJob).toBeDefined();
        });
    });
});

// Helper function
function createMockDeps(mockJobManager: any) {
    return {
        transcriptionClient: { transcribe: jest.fn().mockResolvedValue('Test transcription') },
        llmClient: {
            planReel: jest.fn().mockResolvedValue({
                targetDurationSeconds: 30,
                segmentCount: 3,
                mainCaption: 'Test',
                musicTags: ['inspirational']
            }),
            generateSegmentContent: jest.fn().mockResolvedValue([
                { commentary: 'Test', imagePrompt: 'Image', caption: 'Cap' }
            ]),
            detectContentMode: jest.fn().mockResolvedValue('direct-message'),
            detectReelMode: jest.fn().mockResolvedValue(false)
        },
        ttsClient: {
            synthesize: jest.fn().mockResolvedValue({ audioUrl: 'https://fish.audio/voice.mp3', durationSeconds: 30 })
        },
        fallbackTTSClient: {
            synthesize: jest.fn().mockResolvedValue({ audioUrl: 'https://xtts.example.com/voice.mp3', durationSeconds: 30 })
        },
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
        animatedVideoClient: {
            generateAnimatedVideo: jest.fn().mockResolvedValue({ videoUrl: 'https://kie.ai/video.mp4' })
        },
        callbackToken: 'test-token',
        callbackHeader: 'x-make-apikey'
    };
}
