import { TranscriptionStep } from '../../../src/application/pipelines/steps/TranscriptionStep';
import { IntentDetectionStep } from '../../../src/application/pipelines/steps/IntentDetectionStep';
import { MusicStep } from '../../../src/application/pipelines/steps/MusicStep';
import { createJobContext, executePipeline, JobContext, PipelineStep } from '../../../src/application/pipelines/PipelineInfrastructure';
import { createReelJob } from '../../../src/domain/entities/ReelJob';

describe('Pipeline Infrastructure', () => {
    describe('createJobContext', () => {
        it('should create context from job', () => {
            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.mp3' },
                { min: 10, max: 60 }
            );

            const context = createJobContext('job-123', job);

            expect(context.jobId).toBe('job-123');
            expect(context.job).toBe(job);
        });
    });

    describe('executePipeline', () => {
        it('should execute steps sequentially', async () => {
            const executionOrder: string[] = [];

            const step1: PipelineStep = {
                name: 'Step1',
                execute: async (ctx) => {
                    executionOrder.push('step1');
                    return ctx;
                }
            };

            const step2: PipelineStep = {
                name: 'Step2',
                execute: async (ctx) => {
                    executionOrder.push('step2');
                    return ctx;
                }
            };

            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.mp3' },
                { min: 10, max: 60 }
            );
            const context = createJobContext('job-123', job);

            await executePipeline(context, [step1, step2]);

            expect(executionOrder).toEqual(['step1', 'step2']);
        });

        it('should skip steps when shouldSkip returns true', async () => {
            const executionOrder: string[] = [];

            const step1: PipelineStep = {
                name: 'Step1',
                shouldSkip: () => true,
                execute: async (ctx) => {
                    executionOrder.push('step1');
                    return ctx;
                }
            };

            const step2: PipelineStep = {
                name: 'Step2',
                execute: async (ctx) => {
                    executionOrder.push('step2');
                    return ctx;
                }
            };

            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.mp3' },
                { min: 10, max: 60 }
            );
            const context = createJobContext('job-123', job);

            await executePipeline(context, [step1, step2]);

            expect(executionOrder).toEqual(['step2']);
        });
    });
});

describe('TranscriptionStep', () => {
    it('should skip if transcript already exists', () => {
        const mockTranscriptionClient = { transcribe: jest.fn() };
        const mockJobManager = { updateJob: jest.fn() } as any;

        const step = new TranscriptionStep(mockTranscriptionClient, mockJobManager);

        const context: JobContext = {
            jobId: 'job-123',
            job: {} as any,
            transcript: 'existing transcript'
        };

        expect(step.shouldSkip(context)).toBe(true);
    });

    it('should transcribe if no transcript', async () => {
        const mockTranscriptionClient = {
            transcribe: jest.fn().mockResolvedValue('new transcript')
        };
        const mockJobManager = { updateJob: jest.fn() } as any;

        const step = new TranscriptionStep(mockTranscriptionClient, mockJobManager);

        const context: JobContext = {
            jobId: 'job-123',
            job: { sourceAudioUrl: 'https://example.com/audio.mp3' } as any
        };

        const result = await step.execute(context);

        expect(result.transcript).toBe('new transcript');
        expect(mockTranscriptionClient.transcribe).toHaveBeenCalledWith('https://example.com/audio.mp3');
    });
});

describe('MusicStep', () => {
    it('should skip if music already exists', () => {
        const mockMusicSelector = { selectMusic: jest.fn() } as any;
        const mockJobManager = { updateJob: jest.fn() } as any;

        const step = new MusicStep(mockMusicSelector, mockJobManager);

        const context: JobContext = {
            jobId: 'job-123',
            job: {} as any,
            musicUrl: 'https://example.com/music.mp3'
        };

        expect(step.shouldSkip(context)).toBe(true);
    });
});
