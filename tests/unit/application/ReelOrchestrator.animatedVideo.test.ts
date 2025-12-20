import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';

jest.setTimeout(30000);

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        speakingRateWps: 1.66,
        makeWebhookUrl: 'https://hook.make.com/test',
        featureFlags: { personalCloneTrainingMode: false }
    }))
}));

describe('ReelOrchestrator - Animated Video Flow', () => {
    let orchestrator: ReelOrchestrator;
    let mockDeps: any;
    let mockJobManager: any;

    const mockJobId = 'job-animated-123';
    const mockJob: ReelJob = {
        id: mockJobId,
        sourceAudioUrl: 'https://test.com/audio.mp3',
        status: 'pending',
        targetDurationRange: { min: 30, max: 60 },
        createdAt: new Date(),
        updatedAt: new Date()
    };

    beforeEach(() => {
        jest.setTimeout(20000);
        jest.clearAllMocks();

        // Stateful mock for JobManager
        let currentJobState = { ...mockJob };

        mockJobManager = {
            getJob: jest.fn().mockImplementation(() => Promise.resolve(currentJobState)),
            updateJob: jest.fn().mockImplementation((id, updates) => {
                currentJobState = { ...currentJobState, ...updates };
                return Promise.resolve(currentJobState);
            }),
            createJob: jest.fn(),
            failJob: jest.fn().mockResolvedValue(null),
            updateStatus: jest.fn().mockResolvedValue(null),
            getAllJobs: jest.fn()
        };

        mockDeps = {
            transcriptionClient: {
                transcribe: jest.fn().mockResolvedValue('Test transcription requiring animation')
            },
            llmClient: {
                planReel: jest.fn().mockResolvedValue({
                    targetDurationSeconds: 45,
                    segmentCount: 3,
                    mainCaption: 'Test caption',
                    summary: 'Animation concept',
                    mood: 'Dynamic'
                }),
                generateSegmentContent: jest.fn().mockResolvedValue([
                    { commentary: 'Seg 1', imagePrompt: 'Prompt 1', caption: 'Cap 1' },
                    { commentary: 'Seg 2', imagePrompt: 'Prompt 2', caption: 'Cap 2' },
                    { commentary: 'Seg 3', imagePrompt: 'Prompt 3', caption: 'Cap 3' }
                ]),
                adjustCommentaryLength: jest.fn().mockResolvedValue([
                    { commentary: 'Seg 1', imagePrompt: 'Prompt 1', caption: 'Cap 1' },
                    { commentary: 'Seg 2', imagePrompt: 'Prompt 2', caption: 'Cap 2' },
                    { commentary: 'Seg 3', imagePrompt: 'Prompt 3', caption: 'Cap 3' }
                ]),
                detectReelMode: jest.fn()
            },
            ttsClient: {
                synthesize: jest.fn().mockResolvedValue({
                    audioUrl: 'https://example.com/voiceover.mp3',
                    durationSeconds: 45
                })
            },
            fallbackTTSClient: { synthesize: jest.fn() },
            primaryImageClient: {
                generateImage: jest.fn().mockResolvedValue({ imageUrl: 'https://img.com/1.png' }),
                resetSequence: jest.fn()
            },
            fallbackImageClient: { generateImage: jest.fn() },
            animatedVideoClient: {
                generateAnimatedVideo: jest.fn()
            },
            subtitlesClient: {
                generateSubtitles: jest.fn().mockResolvedValue({ subtitlesUrl: 'https://subs.com/test.srt' })
            },
            videoRenderer: {
                render: jest.fn().mockResolvedValue({
                    videoUrl: 'https://final.com/video.mp4',
                    renderId: 'render-123'
                })
            },
            musicSelector: {
                selectMusic: jest.fn().mockResolvedValue({
                    track: { audioUrl: 'https://music.com/track.mp3', duration: 100 },
                    source: 'catalog'
                })
            },
            jobManager: mockJobManager,
            storageClient: {
                uploadVideo: jest.fn().mockResolvedValue({
                    url: 'https://cloudinary.com/persisted_anim.mp4',
                    publicId: 'test_anim'
                }),
                uploadAudio: jest.fn().mockResolvedValue({ url: 'uploaded-audio.mp3' }),
                uploadImage: jest.fn().mockResolvedValue({ url: 'uploaded-image.png' })
            },
            notificationClient: {
                notifyProgress: jest.fn()
            }
        };

        orchestrator = new ReelOrchestrator(mockDeps);
    });

    it('should detect animated video intent and update job with persisted video', async () => {
        // Setup intent detection to return true
        mockDeps.llmClient.detectReelMode.mockResolvedValue({
            isAnimatedMode: true,
            reason: 'User asked for animation'
        });

        // Use a spy on generateImages to ensure it's NOT called
        const generateImagesSpy = jest.spyOn(orchestrator as any, 'generateImages');
        const updateJobSpy = mockJobManager.updateJob;

        // Mock animated video generation success
        mockDeps.animatedVideoClient.generateAnimatedVideo.mockResolvedValue({
            videoUrl: 'https://generated.com/animation.mp4',
            durationSeconds: 45
        });

        await orchestrator.processJob(mockJobId);

        // Verify intent detection was called
        expect(mockDeps.llmClient.detectReelMode).toHaveBeenCalledWith('Test transcription requiring animation');

        // Verify job was updated with isAnimatedVideoMode: true
        expect(updateJobSpy).toHaveBeenCalledWith(mockJobId, expect.objectContaining({
            isAnimatedVideoMode: true
        }));

        // Verify generateImages was SKIPPED
        expect(generateImagesSpy).not.toHaveBeenCalled();

        // Verify animatedVideoClient was CALLED
        expect(mockDeps.animatedVideoClient.generateAnimatedVideo).toHaveBeenCalledWith(expect.objectContaining({
            durationSeconds: 45,
            theme: 'Animation concept',
            mood: 'Dynamic'
        }));

        // Verify storage upload was attempted
        expect(mockDeps.storageClient.uploadVideo).toHaveBeenCalledWith(
            'https://generated.com/animation.mp4',
            expect.objectContaining({ folder: 'instagram-reels/animated-generated' })
        );

        // Verify job received the PERSISTED animated video URL (Cloudinary)
        expect(updateJobSpy).toHaveBeenCalledWith(mockJobId, expect.objectContaining({
            animatedVideoUrl: 'https://cloudinary.com/persisted_anim.mp4'
        }));
    });

    it('should fall back to image generation if detectReelMode returns false', async () => {
        // Setup intent detection to return false
        mockDeps.llmClient.detectReelMode.mockResolvedValue({
            isAnimatedMode: false,
            reason: 'Static content'
        });

        const generateImagesSpy = jest.spyOn(orchestrator as any, 'generateImages');

        await orchestrator.processJob(mockJobId);

        // Verify generateImages WAS called
        expect(generateImagesSpy).toHaveBeenCalled();
        expect(mockDeps.animatedVideoClient.generateAnimatedVideo).not.toHaveBeenCalled();
    });


});
