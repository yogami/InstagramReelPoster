import { AnimatedVideoStep } from '../../src/application/pipelines/steps/AnimatedVideoStep';
import { JobContext } from '../../src/application/pipelines/PipelineInfrastructure';
import { ReelJob } from '../../src/domain/entities/ReelJob';

describe('AnimatedVideoStep Regression', () => {
    let mockAnimatedClient: any;
    let mockJobManager: any;
    let mockImageService: any;
    let step: AnimatedVideoStep;

    beforeEach(() => {
        mockAnimatedClient = {
            generateAnimatedVideo: jest.fn()
        };
        mockJobManager = {
            updateJob: jest.fn().mockResolvedValue({})
        };
        mockImageService = {
            generateImage: jest.fn().mockResolvedValue('http://example.com/image.jpg')
        };

        step = new AnimatedVideoStep(
            mockAnimatedClient,
            mockJobManager,
            mockImageService
        );
    });

    it('should correctly generate turbo clips with valid URLs', async () => {
        const jobId = 'test-job';
        const job: ReelJob = {
            id: jobId,
            status: 'pending',
            sourceAudioUrl: 'http://test.com/audio.mp3',
            targetDurationRange: { min: 10, max: 20 },
            isAnimatedVideoMode: true,
        } as any;

        const context: JobContext = {
            jobId,
            job,
            voiceoverDuration: 15,
            segments: [
                { startSeconds: 0, endSeconds: 15, imagePrompt: 'test prompt' }
            ]
        } as any;

        const result = await step.execute(context);

        // Verify that the URL doesn't contain "undefined"
        expect(result.animatedVideoUrls).toBeDefined();
        expect(result.animatedVideoUrls![0]).not.toContain('undefined');
        expect(result.animatedVideoUrls![0]).toBe('turbo:http://example.com/image.jpg');
    });

    it('should fail if result is undefined (simulating old bug)', async () => {
        // This is a test for the logic inside the step
        // If we were to re-introduce the bug:
        // const result = await this.imageService.generateImage(...);
        // const imageUrl = result.imageUrl; // imageUrl would be undefined if result is a string

        // We verify that OUR Current code handles the string return 
        const imageUrl = 'http://real-url.com/img.jpg';
        mockImageService.generateImage.mockResolvedValue(imageUrl);

        // We call the private method via any to test it directly
        const turboUrl = await (step as any).generateTurboClip({ theme: 'test' }, 'id');
        expect(turboUrl).toBe('turbo:http://real-url.com/img.jpg');
        expect(turboUrl).not.toContain('undefined');
    });
});
