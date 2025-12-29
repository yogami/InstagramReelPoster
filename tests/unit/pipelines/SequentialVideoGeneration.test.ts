import { AnimatedVideoStep } from '../../../src/application/pipelines/steps/AnimatedVideoStep';
import { JobContext } from '../../../src/application/pipelines/PipelineInfrastructure';
import { JobManager } from '../../../src/application/JobManager';
import { MockAnimatedVideoClient } from '../../../src/infrastructure/video/MockAnimatedVideoClient';
import { ImageGenerationService } from '../../../src/application/services/ImageGenerationService';

describe('Sequential Video Generation', () => {
    let step: AnimatedVideoStep;
    let mockJobManager: jest.Mocked<JobManager>;
    let mockImageService: jest.Mocked<ImageGenerationService>;

    beforeEach(() => {
        mockJobManager = {
            getJob: jest.fn(),
            updateJob: jest.fn(),
            createJob: jest.fn(),
            getAllJobs: jest.fn(),
        } as any;

        mockImageService = {
            generateImage: jest.fn(),
        } as any;

        step = new AnimatedVideoStep(
            new MockAnimatedVideoClient(),
            mockJobManager,
            mockImageService
        );
    });

    it('should generate turbo clips sequentially, not in parallel', async () => {
        const generatedTimes: number[] = [];
        const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

        // Mock generateImage to take some time and record when it starts
        mockImageService.generateImage.mockImplementation(async () => {
            const start = Date.now();
            generatedTimes.push(start);
            await delay(100); // Simulate processing time
            return 'http://example.com/image.png';
        });

        const context: JobContext = {
            jobId: 'test-job',
            job: {
                id: 'test-job',
                status: 'generating_animated_video',
                type: 'reel',
                createdAt: new Date(),
                userId: 'user-1',
                // Triggers turbo mode logic
                videoModel: 'flux', // or any non-video model causing image fallback
                targetDurationSeconds: 60,
                targetDurationRange: { min: 30, max: 60 },
                sourceAudioUrl: 'http://test.com/audio.mp3',
                isAnimatedVideoMode: true,
            } as any,
            segments: []
        };

        // Force "Direct-Message mode" logic by ensuring condition: 
        // (!context.job.videoModel || context.job.videoModel !== 'kling') -> true (default is mocked as flux or empty)
        // AND validation check passes

        // We need to bypass the "Animated mode" check at the top of execute
        // The step checks: if (job.mode !== 'animated') return context;
        // We need to bypass the "Animated mode" check at the top of execute
        context.isAnimatedMode = true;
        context.job.isAnimatedVideoMode = true;

        // Set up segment logic to trigger loop
        // If we provide a transcript, it will generate clips based on duration
        context.job.transcript = "This is a long transcript that requires multiple clips to cover the duration.";

        await step.execute(context);

        // Analysis:
        // If parallel: all start times would be very close (within a few ms)
        // If sequential: start times should be spaced by at least 100ms

        // We expect at least 2 clips for 60s duration (default maxClipDuration is likely 5-10s)
        // Actually maxClipDuration is 5 in code seen previously? 
        // Let's just check the timestamps.

        expect(generatedTimes.length).toBeGreaterThan(1);

        for (let i = 1; i < generatedTimes.length; i++) {
            const gap = generatedTimes[i] - generatedTimes[i - 1];
            // If parallel, gap is ~0-5ms. If sequential with 100ms task, gap >= 100ms.
            // Using 50ms as a safe threshold.
            expect(gap).toBeGreaterThanOrEqual(50);
        }
    });
});
