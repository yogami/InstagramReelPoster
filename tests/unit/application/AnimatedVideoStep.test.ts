import { AnimatedVideoStep } from '../../../src/application/pipelines/steps/AnimatedVideoStep';
import { JobContext } from '../../../src/application/pipelines/PipelineInfrastructure';

describe('AnimatedVideoStep (Regression)', () => {
    let step: AnimatedVideoStep;
    let mockAnimatedClient: any;
    let mockJobManager: any;
    let mockImageService: any;
    let mockStorageClient: any;

    beforeEach(() => {
        mockAnimatedClient = {
            generateAnimatedVideo: jest.fn().mockResolvedValue({ videoUrl: 'https://video.com' })
        };
        mockJobManager = {
            updateJob: jest.fn(),
            getJob: jest.fn()
        };
        mockImageService = {
            generateImage: jest.fn().mockResolvedValue('https://image.com')
        };
        mockStorageClient = {
            uploadVideo: jest.fn().mockResolvedValue({ url: 'https://cdn.com/video.mp4' }),
            uploadImage: jest.fn().mockResolvedValue({ url: 'https://cdn.com/image.png' })
        };

        step = new AnimatedVideoStep(
            mockAnimatedClient,
            mockJobManager,
            mockImageService,
            mockStorageClient
        );
    });

    it('should use Turbo Mode (Image-based) for non-parable reels', async () => {
        const context: JobContext = {
            jobId: 'job-turbo',
            job: {
                id: 'job-turbo',
                contentMode: 'direct-message',
                targetDurationSeconds: 15
            } as any,
            contentMode: 'direct-message'
        };

        const result = await step.execute(context);

        // Verify it called the image service
        expect(mockImageService.generateImage).toHaveBeenCalled();
        expect(mockAnimatedClient.generateAnimatedVideo).not.toHaveBeenCalled();
        expect(result.animatedVideoUrls![0]).toBe('turbo:https://image.com');
    });

    it('should use Full Video Mode for parable reels', async () => {
        const context: JobContext = {
            jobId: 'job-parable',
            job: {
                id: 'job-parable',
                contentMode: 'parable'
            } as any,
            contentMode: 'parable',
            parableScriptPlan: {
                beats: [{ narration: 'Story part 1', approxDurationSeconds: 5 }]
            } as any
        };

        const result = await step.execute(context);

        // Verify it called the animated client and persisted to Cloudinary
        expect(mockAnimatedClient.generateAnimatedVideo).toHaveBeenCalled();
        expect(result.animatedVideoUrls![0]).toBe('https://cdn.com/video.mp4');
    });

    it('reproduces TypeError if imageService method is missing', async () => {
        // BREAK the mock to reproduce the production bug
        mockImageService.generateImage = undefined;

        const context: JobContext = {
            jobId: 'job-fail',
            job: { contentMode: 'direct-message' } as any,
            contentMode: 'direct-message'
        };

        // This should trigger the fallback instead of crashing
        const result = await step.execute(context);
        expect(result.animatedVideoUrls).toBeDefined();
        // Since it falls back to a default URL in the code on failure
        expect(result.animatedVideoUrls![0]).toContain('samples/elephants.mp4');
    });
});
