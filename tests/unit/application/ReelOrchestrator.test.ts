import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';
import { SegmentContent, ReelPlan } from '../../../src/domain/ports/ILlmClient';
import { Segment } from '../../../src/domain/entities/Segment';

// Mock all dependencies
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        fishAudioPromoVoiceId: 'promo-voice-123',
        featureFlags: {
            personalCloneTrainingMode: false
        }
    }))
}));

describe('ReelOrchestrator', () => {
    let orchestrator: ReelOrchestrator;
    let mockDeps: any;
    let mockJobManager: jest.Mocked<JobManager>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn(),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        } as any;

        mockDeps = {
            transcriptionClient: {
                transcribe: jest.fn().mockResolvedValue('Test transcription')
            },
            llmClient: {
                planReel: jest.fn().mockResolvedValue({
                    targetDurationSeconds: 60,
                    segmentCount: 6,
                    mainCaption: 'Test caption'
                }),
                generateSegmentContent: jest.fn().mockResolvedValue([
                    { commentary: 'Test 1', imagePrompt: 'Prompt 1', caption: 'Cap 1' },
                    { commentary: 'Test 2', imagePrompt: 'Prompt 2', caption: 'Cap 2' }
                ]),
                adjustCommentaryLength: jest.fn(),
                detectReelMode: jest.fn().mockResolvedValue({ isAnimatedMode: false }),
                detectContentMode: jest.fn().mockResolvedValue({ contentMode: 'direct-message', reason: 'test' })
            },
            ttsClient: {
                synthesize: jest.fn().mockResolvedValue({
                    audioUrl: 'https://example.com/audio.mp3',
                    durationSeconds: 60
                })
            },
            fallbackTtsClient: {
                synthesize: jest.fn()
            },
            primaryImageClient: {
                generateImage: jest.fn().mockResolvedValue({
                    imageUrl: 'https://example.com/image.png'
                })
            },
            fallbackImageClient: {
                generateImage: jest.fn().mockResolvedValue({
                    imageUrl: 'https://example.com/fallback-image.png'
                })
            },
            subtitlesClient: {
                generateSubtitles: jest.fn().mockResolvedValue('subtitle-url')
            },
            videoRenderer: {
                render: jest.fn().mockResolvedValue({
                    videoUrl: 'https://example.com/video.mp4',
                    renderId: 'render-123'
                })
            },
            musicSelector: {
                selectMusic: jest.fn().mockResolvedValue({
                    track: { audioUrl: 'https://example.com/music.mp3' },
                    source: 'catalog'
                })
            },
            jobManager: mockJobManager,
            storageClient: {
                uploadAudio: jest.fn().mockResolvedValue({ url: 'uploaded-audio-url' }),
                uploadImage: jest.fn().mockImplementation((url: string) => Promise.resolve({ url }))
            },
            callbackToken: 'test-token',
            callbackHeader: 'x-make-apikey'
        };

        orchestrator = new ReelOrchestrator(mockDeps);
    });

    describe('validateSegmentCount', () => {
        test('should throw if segments is not an array', () => {
            const validateFn = (orchestrator as any).validateSegmentCount.bind(orchestrator);

            expect(() => validateFn({}, 5, 'test')).toThrow('LLM returned non-array segment content');
        });

        test('should throw if segment count does not match expected', () => {
            const validateFn = (orchestrator as any).validateSegmentCount.bind(orchestrator);

            const segments = [
                { commentary: 'Test commentary 1', imagePrompt: 'Prompt 1' },
                { commentary: 'Test commentary 2', imagePrompt: 'Prompt 2' }
            ];

            expect(() => validateFn(segments, 5, 'initial')).toThrow('Segment count mismatch');
        });

        test('should throw if a segment has empty commentary', () => {
            const validateFn = (orchestrator as any).validateSegmentCount.bind(orchestrator);

            const segments = [
                { commentary: 'Valid commentary', imagePrompt: 'Prompt 1' },
                { commentary: '', imagePrompt: 'Prompt 2' } // Empty
            ];

            expect(() => validateFn(segments, 2, 'test')).toThrow('missing or too-short commentary');
        });

        test('should throw if a segment has very short commentary', () => {
            const validateFn = (orchestrator as any).validateSegmentCount.bind(orchestrator);

            const segments = [
                { commentary: 'Valid commentary', imagePrompt: 'Prompt 1' },
                { commentary: 'Hi', imagePrompt: 'Prompt 2' } // Too short (< 5 chars)
            ];

            expect(() => validateFn(segments, 2, 'test')).toThrow('missing or too-short commentary');
        });

        test('should pass for valid segments matching expected count', () => {
            const validateFn = (orchestrator as any).validateSegmentCount.bind(orchestrator);

            const segments = [
                { commentary: 'Valid segment one commentary', imagePrompt: 'Prompt 1' },
                { commentary: 'Valid segment two commentary', imagePrompt: 'Prompt 2' },
                { commentary: 'Valid segment three commentary', imagePrompt: 'Prompt 3' }
            ];

            expect(() => validateFn(segments, 3, 'test')).not.toThrow();
        });
    });

    describe('buildSegments', () => {
        test('should create segments with proper timing distribution', () => {
            const buildFn = (orchestrator as any).buildSegments.bind(orchestrator);

            const content: SegmentContent[] = [
                { commentary: 'Segment 1', imagePrompt: 'Prompt 1', caption: 'Cap 1' },
                { commentary: 'Segment 2', imagePrompt: 'Prompt 2', caption: 'Cap 2' },
                { commentary: 'Segment 3', imagePrompt: 'Prompt 3', caption: 'Cap 3' }
            ];

            const segments = buildFn(content, 60);

            expect(segments).toHaveLength(3);
            expect(segments[0].index).toBe(0);
            expect(segments[1].index).toBe(1);
            expect(segments[2].index).toBe(2);
        });

        test('should distribute duration equally among segments', () => {
            const buildFn = (orchestrator as any).buildSegments.bind(orchestrator);

            const content: SegmentContent[] = [
                { commentary: 'A', imagePrompt: 'P1', caption: 'C1' },
                { commentary: 'B', imagePrompt: 'P2', caption: 'C2' }
            ];

            const segments = buildFn(content, 60);

            // Two segments over 60 seconds = ~30s each
            expect(segments[0].startSeconds).toBeCloseTo(0, 0);
            expect(segments[1].startSeconds).toBeCloseTo(30, 0);
        });

        test('should include commentary and imagePrompt in segments', () => {
            const buildFn = (orchestrator as any).buildSegments.bind(orchestrator);

            const content: SegmentContent[] = [
                { commentary: 'Test commentary', imagePrompt: 'Test prompt', caption: 'Test cap' }
            ];

            const segments = buildFn(content, 30);

            expect(segments[0].commentary).toBe('Test commentary');
            expect(segments[0].imagePrompt).toBe('Test prompt');
            expect(segments[0].caption).toBe('Test cap');
        });
    });

    describe('getFriendlyErrorMessage', () => {
        test('should return transcription message for transcribe errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('Failed to transcribe audio');
            expect(message).toContain('could not understand the audio');
        });

        test('should return API message for Gpt errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('Gpt API rate limit exceeded');
            expect(message).toContain('issue connecting to our AI services');
        });

        test('should return music message for track errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('No music tracks found');
            expect(message).toContain('could not find suitable background music');
        });

        test('should return image message for ImageGen errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('ImageGen generation failed');
            expect(message).toContain('trouble generating images');
        });

        test('should return render message for video errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('Video rendering timeout');
            expect(message).toContain('video rendering failed');
        });

        test('should return duration message for too short/long errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('Audio duration too short');
            expect(message).toContain('too short or too long');
        });

        test('should return generic message for unknown errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('Some random error');
            expect(message).toContain('unexpected error');
        });
    });

    describe('synthesizeWithAdjustment', () => {
        test('should synthesize voiceover with TTS client', async () => {
            const synthesizeFn = (orchestrator as any).synthesizeWithAdjustment.bind(orchestrator);

            const result = await synthesizeFn('Test text for voiceover', 60);

            expect(mockDeps.ttsClient.synthesize).toHaveBeenCalled();
            expect(result).toHaveProperty('voiceoverUrl');
            expect(result).toHaveProperty('voiceoverDuration');
        });

        test('should fall back to secondary TTS if primary fails', async () => {
            // Set up primary to fail
            mockDeps.ttsClient.synthesize.mockRejectedValue(new Error('Primary TTS failed'));
            mockDeps.fallbackTtsClient.synthesize.mockResolvedValue({
                audioUrl: 'https://fallback.com/audio.mp3',
                durationSeconds: 55
            });

            const synthesizeFn = (orchestrator as any).synthesizeWithAdjustment.bind(orchestrator);

            const result = await synthesizeFn('Test text', 60);

            expect(mockDeps.fallbackTtsClient.synthesize).toHaveBeenCalled();
            expect(result.voiceoverDuration).toBe(55);
        });
    });

    describe('generateImages', () => {
        test('should generate images for all segments', async () => {
            // Add resetSequence to the mock
            mockDeps.primaryImageClient.resetSequence = jest.fn();
            // Ensure updateJob is available
            mockJobManager.updateJob.mockResolvedValue(null);

            const generateFn = (orchestrator as any).generateImages.bind(orchestrator);

            const segments: Partial<Segment>[] = [
                { index: 0, imagePrompt: 'Prompt 1', startSeconds: 0, endSeconds: 30 },
                { index: 1, imagePrompt: 'Prompt 2', startSeconds: 30, endSeconds: 60 }
            ];

            const result = await generateFn(segments, 'job-123');

            // Verify we got results with image URLs
            expect(result).toHaveLength(2);
            expect(result[0].imageUrl).toBeDefined();
            expect(result[1].imageUrl).toBeDefined();
        });

        test('should use fallback image client if primary fails', async () => {
            mockDeps.primaryImageClient.generateImage.mockRejectedValueOnce(new Error('Primary failed'));

            const generateFn = (orchestrator as any).generateImages.bind(orchestrator);

            const segments: Partial<Segment>[] = [
                { index: 0, imagePrompt: 'Prompt 1', startSeconds: 0, endSeconds: 30 }
            ];

            const result = await generateFn(segments, 'job-123');

            expect(mockDeps.fallbackImageClient.generateImage).toHaveBeenCalled();
            expect(result[0].imageUrl).toContain('fallback');
        });
    });

    describe('renderPromoReel', () => {
        const promoScript: any = {
            caption: 'Promo caption',
            coreMessage: 'Core message',
            scenes: [
                { duration: 5, narration: 'Scene 1', imagePrompt: 'Prompt 1', subtitle: 'Sub 1', role: 'hook' }
            ],
            musicStyle: 'upbeat'
        };

        const job: any = {
            id: 'job-promo',
            websitePromoInput: { websiteUrl: 'https://test.com' }
        };

        beforeEach(() => {
            mockJobManager.getJob.mockResolvedValue(job);
            mockJobManager.updateJob.mockResolvedValue(job);
            // mock preparePromoAssets to avoid depth
            (orchestrator as any).preparePromoAssets = jest.fn().mockResolvedValue({
                voiceoverUrl: 'vo-url',
                voiceoverDuration: 5,
                musicUrl: 'music-url',
                musicDurationSeconds: 5,
                segmentsWithImages: [{ index: 0, startSeconds: 0, endSeconds: 5, imageUrl: 'img-url', commentary: 'test' }]
            });
            (orchestrator as any).finalizePromoJob = jest.fn().mockResolvedValue(job);
        });

        test('should use job.voiceId if provided', async () => {
            const promoJob = { ...job, voiceId: 'custom-voice-999' };
            await (orchestrator as any).renderPromoReel('job-promo', promoJob, promoScript, 'service', 'Test Biz');

            expect((orchestrator as any).preparePromoAssets).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'service',
                    promoScript,
                    voiceId: 'custom-voice-999'
                })
            );
        });

        test('should fall back to fishAudioPromoVoiceId from config if job.voiceId is missing', async () => {
            await (orchestrator as any).renderPromoReel('job-promo', job, promoScript, 'service', 'Test Biz');

            expect((orchestrator as any).preparePromoAssets).toHaveBeenCalledWith(
                expect.objectContaining({
                    category: 'service',
                    promoScript,
                    voiceId: 'promo-voice-123'
                })
            );
        });
        test('should pass musicUrl and other assets to the manifest', async () => {
            // Un-mock finalizePromoJob for this test to see the manifest
            const originalFinalize = (orchestrator as any).finalizePromoJob;
            (orchestrator as any).finalizePromoJob = jest.fn().mockImplementation((id, j, manifest) => {
                return manifest; // Return manifest for verification
            });

            const manifest = await (orchestrator as any).renderPromoReel('job-promo', job, promoScript, 'service', 'Test Biz');

            expect(manifest.musicUrl).toBe('music-url');
            expect(manifest.voiceoverUrl).toBe('vo-url');
            expect(manifest.durationSeconds).toBe(5);

            (orchestrator as any).finalizePromoJob = originalFinalize;
        });
    });

    test('should use providedCommentary if present in job, skipping LLM generation', async () => {
        const processFn = (orchestrator as any).processJob.bind(orchestrator);

        const job: ReelJob = {
            id: 'job-123',
            status: 'pending',
            createdAt: new Date(),
            updatedAt: new Date(),
            sourceAudioUrl: 'http://test.com/audio.mp3',
            voiceId: 'voice-123',
            targetDurationRange: { min: 10, max: 90 }
        };
        const jobWithCommentary = { ...job, providedCommentary: 'User provided text override.' };
        mockJobManager.getJob.mockResolvedValue(jobWithCommentary);

        // Mock internal helpers
        (orchestrator as any).updateJobStatus = jest.fn();
        (orchestrator as any).adjustProvidedCommentaryForDuration = jest.fn().mockReturnValue('Adjusted text');
        (orchestrator as any).synthesizeWithAdjustment = jest.fn().mockResolvedValue({ voiceoverUrl: 'vo.mp3', voiceoverDuration: 10 });
        (orchestrator as any).buildSegments = jest.fn().mockReturnValue([]);

        mockDeps.llmClient.planReel.mockResolvedValue({ targetDurationSeconds: 15, segmentCount: 1 });

        await processFn('job-123');

        expect(mockDeps.llmClient.generateSegmentContent).not.toHaveBeenCalled();
    });


    describe('adjustProvidedCommentaryForDuration', () => {
        const targetDuration = 60; // 60 seconds
        // Speaking rate 1.66 wps * 60s * 0.95 = ~94 words limit

        test('should return text as-is if within limit', () => {
            const adjustFn = (orchestrator as any).adjustProvidedCommentaryForDuration.bind(orchestrator);
            const shortText = 'This is a short commentary that definitely fits.';

            const result = adjustFn(shortText, targetDuration);
            expect(result).toBe(shortText);
        });

        test('should truncate text at sentence boundary when over limit', () => {
            const adjustFn = (orchestrator as any).adjustProvidedCommentaryForDuration.bind(orchestrator);

            // Create text that exceeds 94 words
            const sentence1 = 'This is the first sentence that should be kept because it is important. ';
            const sentence2 = 'This is the second sentence that is also kept. ';
            // Create filler carefully to ensure reproducible length
            const filler = Array(100).fill('word').join(' ');
            const longText = sentence1 + sentence2 + filler + ' End.';

            const result = adjustFn(longText, targetDuration);

            // Should be truncated, but not longer than limit
            expect(result.length).toBeLessThan(longText.length);
            // Should end with a sentence key (., !, ?) or ellipsis
            const endsWithPunctuation = /[.!?]$/.test(result);
            const endsWithEllipsis = result.endsWith('...');
            expect(endsWithPunctuation || endsWithEllipsis).toBe(true);
        });

        test('should add ellipsis if no sentence boundary found in usable range', () => {
            const adjustFn = (orchestrator as any).adjustProvidedCommentaryForDuration.bind(orchestrator);

            // Text with no punctuation
            const longText = Array(150).fill('word').join(' ');

            const result = adjustFn(longText, targetDuration);
            expect(result.endsWith('...')).toBe(true);
        });
    });
});
