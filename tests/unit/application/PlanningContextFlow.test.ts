
import { PlanningStep } from '../../../src/application/pipelines/steps/PlanningStep';
import { JobContext } from '../../../src/application/pipelines/PipelineInfrastructure';

describe('PlanningStep Context Propagation Regression', () => {
    let step: PlanningStep;
    let mockLlm: any;
    let mockJobManager: any;

    beforeEach(() => {
        mockLlm = {
            extractParableIntent: jest.fn().mockResolvedValue({ coreTheme: 'wisdom', moral: 'be wise' }),
            generateParableScript: jest.fn().mockResolvedValue({
                beats: [{ narration: 'Part 1', approxDurationSeconds: 10, imagePrompt: 'img1' }]
            }),
            planReel: jest.fn().mockResolvedValue({ targetDurationSeconds: 45, segmentCount: 3 })
        };
        mockJobManager = {
            updateJob: jest.fn().mockResolvedValue({}),
            getJob: jest.fn()
        };
        step = new PlanningStep(mockLlm, mockJobManager);
    });

    it('should propagate parableScriptPlan to the context after execution', async () => {
        const jobId = 'job-123';
        const context: JobContext = {
            jobId,
            job: {
                id: jobId,
                targetDurationRange: { min: 30, max: 60 },
                providedCommentary: 'Some story'
            } as any,
            contentMode: 'parable'
        } as any;

        const result = await step.execute(context) as any;

        // This is the CRITICAL check. If this fails, AnimatedVideoStep falls back to images.
        expect(result.parableScriptPlan).toBeDefined();
        expect(result.parableScriptPlan.beats).toBeDefined();
        expect(result.parableScriptPlan.beats.length).toBe(1);
    });
});
