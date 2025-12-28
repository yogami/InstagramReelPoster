
import { ContentModeStep } from '../../../src/application/pipelines/steps/ContentModeStep';
import { JobContext } from '../../../src/application/pipelines/PipelineInfrastructure';

describe('ContentModeStep TDD Heuristics', () => {
    let step: ContentModeStep;
    let mockLlm: any;
    let mockJobManager: any;

    beforeEach(() => {
        mockLlm = {
            detectContentMode: jest.fn().mockResolvedValue({ contentMode: 'direct-message' })
        };
        mockJobManager = {
            updateJob: jest.fn().mockResolvedValue({})
        };
        step = new ContentModeStep(mockLlm, mockJobManager);
    });

    it('should force PARABLE mode when user explicitly asks for an animation video', async () => {
        const jobId = 'job-123';
        const context: JobContext = {
            jobId,
            job: {
                id: jobId,
                description: 'A 1 minute Instagram animation video'
            } as any
        };

        const result = await step.execute(context);

        expect(result.contentMode).toBe('parable');
        // It should skip the LLM call because the heuristic matched
        expect(mockLlm.detectContentMode).not.toHaveBeenCalled();
    });

    it('should default to direct-message for standard narration if no keywords match', async () => {
        const jobId = 'job-456';
        const context: JobContext = {
            jobId,
            job: {
                id: jobId,
                description: 'A simple direct message narration'
            } as any
        };

        const result = await step.execute(context);

        expect(result.contentMode).toBe('direct-message');
        expect(mockLlm.detectContentMode).toHaveBeenCalled();
    });
});
