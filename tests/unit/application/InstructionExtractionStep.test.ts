
import { InstructionExtractionStep } from '../../../src/application/pipelines/steps/InstructionExtractionStep';
import { JobContext } from '../../../src/application/pipelines/PipelineInfrastructure';

describe('InstructionExtractionStep', () => {
    let step: InstructionExtractionStep;
    let mockJobManager: any;

    beforeEach(() => {
        mockJobManager = {
            updateJob: jest.fn().mockResolvedValue({})
        };
        step = new InstructionExtractionStep(mockJobManager);
    });

    it('should extract exact phrasing from transcript', async () => {
        const context = {
            jobId: '123',
            transcript: 'A 1 minute Instagram parable video with animation where a modern rumi is speaking to the divine with the following words "O Beloved,\nI know the science...\nAmen."',
            job: { id: '123' }
        } as unknown as JobContext;

        const result = await step.execute(context);

        expect(result.job.providedCommentary).toContain('O Beloved');
        expect(result.job.providedCommentary).toContain('Amen.');
        expect(mockJobManager.updateJob).toHaveBeenCalledWith('123', {
            providedCommentary: expect.stringContaining('O Beloved')
        });
    });

    it('should extract exact phrasing from description (Telegram caption)', async () => {
        const context = {
            jobId: '123',
            transcript: 'Audio content',
            job: {
                id: '123',
                description: 'Use this exact phrasing: "The soul is here for its own joy. - Rumi"'
            }
        } as unknown as JobContext;

        const result = await step.execute(context);

        expect(result.job.providedCommentary).toBe('The soul is here for its own joy. - Rumi');
    });

    it('should handle "retain user narrated commentary" pattern', async () => {
        const context = {
            jobId: '123',
            transcript: 'Retain the user narrated commentary: I choose to fall on my knees.',
            job: { id: '123' }
        } as unknown as JobContext;

        const result = await step.execute(context);

        expect(result.job.providedCommentary).toBe('I choose to fall on my knees.');
    });
});
