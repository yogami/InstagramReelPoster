import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';
import { SegmentContent, ReelPlan } from '../../../src/domain/ports/ILLMClient';
import { Segment } from '../../../src/domain/entities/Segment';

// Mock all dependencies
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test'
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
            getAllJobs: jest.fn()
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
                adjustCommentaryLength: jest.fn()
            },
            ttsClient: {
                synthesize: jest.fn().mockResolvedValue({
                    audioUrl: 'https://example.com/audio.mp3',
                    durationSeconds: 60
                })
            },
            fallbackTTSClient: {
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

        test('should return API message for OpenAI errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('OpenAI API rate limit exceeded');
            expect(message).toContain('issue connecting to our AI services');
        });

        test('should return music message for track errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('No music tracks found');
            expect(message).toContain('could not find suitable background music');
        });

        test('should return image message for DALL-E errors', () => {
            const getFriendlyFn = (orchestrator as any).getFriendlyErrorMessage.bind(orchestrator);

            const message = getFriendlyFn('DALL-E generation failed');
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
            mockDeps.fallbackTTSClient.synthesize.mockResolvedValue({
                audioUrl: 'https://fallback.com/audio.mp3',
                durationSeconds: 55
            });

            const synthesizeFn = (orchestrator as any).synthesizeWithAdjustment.bind(orchestrator);

            const result = await synthesizeFn('Test text', 60);

            expect(mockDeps.fallbackTTSClient.synthesize).toHaveBeenCalled();
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
});
