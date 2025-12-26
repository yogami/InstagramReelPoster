
import { ReelOrchestrator, OrchestratorDependencies } from '../../src/application/ReelOrchestrator';
import { ReelJob, createReelJob } from '../../src/domain/entities/ReelJob';
import { ReelPlan, SegmentContent } from '../../src/domain/ports/ILLMClient';

describe('ReelOrchestrator Segment Consistency', () => {
    let deps: any;
    let orchestrator: ReelOrchestrator;

    beforeEach(() => {
        deps = {
            transcriptionClient: { transcribe: jest.fn() },
            llmClient: {
                planReel: jest.fn(),
                generateSegmentContent: jest.fn(),
                adjustCommentaryLength: jest.fn(),
                detectReelMode: jest.fn().mockResolvedValue({ isAnimatedMode: false })
            },
            ttsClient: { synthesize: jest.fn() },
            videoRenderer: {
                renderVideo: jest.fn().mockResolvedValue('video_url'),
                healthCheck: jest.fn().mockResolvedValue(true)
            },
            subtitlesClient: { generateSubtitles: jest.fn() },
            musicSelector: { selectMusic: jest.fn() },
            jobManager: {
                getJob: jest.fn(),
                updateJob: jest.fn().mockResolvedValue({}),
                saveJob: jest.fn().mockResolvedValue({}),
                updateStatus: jest.fn().mockResolvedValue({}),
                failJob: jest.fn().mockResolvedValue({})
            },
            fallbackImageClient: { generateImage: jest.fn() },
            storageClient: { uploadFile: jest.fn().mockResolvedValue('url') }
        };

        orchestrator = new ReelOrchestrator(deps as any);
    });

    test('Should FAIL if LLM returns fewer segments than planned', async () => {
        const jobId = 'test-job';
        const job = createReelJob(jobId, { sourceAudioUrl: 'url' }, { min: 10, max: 90 });
        job.transcript = 'mock transcript';
        job.status = 'transcribing'; // Ensure it moves forward

        deps.jobManager.getJob.mockResolvedValue(job);

        // Planner says 12 segments
        const mockPlan: ReelPlan = {
            targetDurationSeconds: 60,
            segmentCount: 12,
            musicTags: [],
            musicPrompt: '',
            mood: 'mood',
            summary: 'summary',
            mainCaption: 'caption'
        };
        deps.llmClient.planReel.mockResolvedValue(mockPlan);

        // Generator returns only 1 segment (the "lazy" bug)
        const lazySegments: SegmentContent[] = [{
            commentary: 'Too lazy to write 12 segments.',
            imagePrompt: 'Lazy AI',
            caption: 'Lazy'
        }];
        deps.llmClient.generateSegmentContent.mockResolvedValue(lazySegments);
        deps.llmClient.adjustCommentaryLength.mockResolvedValue(lazySegments);

        // Expect processJob to throw an error about segment count mismatch
        // Currently this will fail (it won't throw) because of the "Defensive" recovery logic
        await expect(orchestrator.processJob(jobId)).rejects.toThrow(/Segment count mismatch/);
    });
});
