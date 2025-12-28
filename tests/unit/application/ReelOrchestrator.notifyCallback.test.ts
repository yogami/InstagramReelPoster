import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';
import axios from 'axios';

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        fishAudioPromoVoiceId: 'promo-voice-123'
    }))
}));

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ReelOrchestrator.notifyCallback', () => {
    let orchestrator: ReelOrchestrator;
    let mockDeps: any;
    let mockJobManager: jest.Mocked<JobManager>;

    beforeEach(() => {
        jest.clearAllMocks();
        mockAxios.post.mockReset();
        mockAxios.post.mockResolvedValue({ data: {} });

        mockJobManager = {
            getJob: jest.fn(),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn()
        } as any;

        mockDeps = {
            transcriptionClient: { transcribe: jest.fn() },
            llmClient: { planReel: jest.fn(), generateSegmentContent: jest.fn() },
            ttsClient: { synthesize: jest.fn() },
            fallbackTtsClient: { synthesize: jest.fn() },
            primaryImageClient: { generateImage: jest.fn() },
            fallbackImageClient: { generateImage: jest.fn() },
            subtitlesClient: { generateSubtitles: jest.fn() },
            videoRenderer: { render: jest.fn() },
            musicSelector: { selectMusic: jest.fn() },
            jobManager: mockJobManager,
            storageClient: { uploadAudio: jest.fn(), uploadImage: jest.fn() },
            callbackToken: 'test-token',
            callbackHeader: 'x-make-apikey'
        };

        orchestrator = new ReelOrchestrator(mockDeps);
    });

    describe('callback URL handling', () => {
        it('should skip callback if no callbackUrl', async () => {
            const job = createMockJob({ callbackUrl: undefined });

            await invokeNotifyCallback(orchestrator, job);

            expect(mockAxios.post).not.toHaveBeenCalled();
        });

        it('should skip callback if completed but no video URL', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: undefined
            });

            await invokeNotifyCallback(orchestrator, job);

            expect(mockAxios.post).not.toHaveBeenCalled();
        });

        it('should send callback when completed with video URL', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4'
            });

            await invokeNotifyCallback(orchestrator, job);

            expect(mockAxios.post).toHaveBeenCalledWith(
                'https://callback.example.com',
                expect.any(Object),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'x-make-apikey': expect.any(String)
                    })
                })
            );
        });
    });

    describe('caption fallback chain', () => {
        it('should use mainCaption when available', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4',
                mainCaption: 'Main caption text'
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.caption).toContain('Main caption text');
        });

        it('should fall back to segment caption when mainCaption missing', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4',
                mainCaption: undefined,
                segments: [{
                    index: 0,
                    startSeconds: 0,
                    endSeconds: 5,
                    commentary: 'Commentary',
                    imagePrompt: 'Image prompt',
                    caption: 'Segment caption'
                }]
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.caption).toContain('Segment caption');
        });

        it('should fall back to transcript when both captions missing', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4',
                mainCaption: undefined,
                segments: [],
                transcript: 'Original transcript content'
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.caption).toContain('Original transcript');
        });

        it('should fall back to fullCommentary when transcript missing', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4',
                mainCaption: undefined,
                segments: [],
                transcript: undefined,
                fullCommentary: 'Full commentary text here'
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.caption).toContain('Full commentary');
        });
    });

    describe('payload construction', () => {
        it('should include hashtags in caption', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4',
                hashtags: ['#test', '#reel']
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.hashtags).toContain('#test');
            expect(payload.hashtags).toContain('#reel');
        });

        it('should include error in payload when present', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'failed',
                error: 'Something went wrong'
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.error).toBe('Something went wrong');
        });

        it('should include video URL aliases', async () => {
            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4'
            });

            await invokeNotifyCallback(orchestrator, job);

            const payload = getLastAxiosPayload();
            expect(payload.video_url).toBe('https://video.example.com/final.mp4');
            expect(payload.url).toBe('https://video.example.com/final.mp4');
            expect(payload.videoUrl).toBe('https://video.example.com/final.mp4');
        });
    });

    describe('error handling', () => {
        it('should handle axios errors gracefully', async () => {
            mockAxios.post.mockRejectedValue(new Error('Network error'));

            const job = createMockJob({
                callbackUrl: 'https://callback.example.com',
                status: 'completed',
                finalVideoUrl: 'https://video.example.com/final.mp4'
            });

            // Should not throw
            await expect(invokeNotifyCallback(orchestrator, job)).resolves.not.toThrow();
        });
    });
});

// Helper functions
function createMockJob(overrides: Partial<ReelJob>): ReelJob {
    return {
        id: 'test-job-123',
        status: 'pending',
        sourceAudioUrl: 'https://audio.example.com/source.mp3',
        targetDurationRange: { min: 30, max: 60 },
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    } as ReelJob;
}

async function invokeNotifyCallback(orchestrator: ReelOrchestrator, job: ReelJob): Promise<void> {
    return (orchestrator as any).notifyCallback(job);
}

function getLastAxiosPayload(): any {
    const calls = mockAxios.post.mock.calls;
    if (calls.length === 0) return null;
    const lastCall = calls[calls.length - 1];
    return lastCall[1]; // payload is second argument to axios.post
}
