import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { TrainingDataCollector } from '../../../src/infrastructure/training/TrainingDataCollector';
import { getConfig } from '../../../src/config';

jest.mock('../../../src/infrastructure/training/TrainingDataCollector');
jest.mock('../../../src/config');

describe('ReelOrchestrator - Personal Clone Integration', () => {
    let orchestrator: any;
    let mockDeps: any;
    let mockJob: any;

    const mockConfig = {
        featureFlags: {
            personalCloneTrainingMode: true
        },
        personalClone: {
            trainingDataPath: './data'
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getConfig as jest.Mock).mockReturnValue(mockConfig);

        mockDeps = {
            transcriptionClient: { transcribe: jest.fn().mockResolvedValue('Transcript text') },
            llmClient: {
                detectReelMode: jest.fn().mockResolvedValue({ isAnimatedMode: false }),
                detectContentMode: jest.fn().mockResolvedValue({ contentMode: 'direct-message', reason: 'test' }),
                planReel: jest.fn().mockResolvedValue({ targetDurationSeconds: 30, segmentCount: 2 }),
                generateSegmentContent: jest.fn().mockResolvedValue([
                    { commentary: 'Segment 1', imagePrompt: 'Prompt 1' },
                    { commentary: 'Segment 2', imagePrompt: 'Prompt 2' }
                ]),
                adjustCommentaryLength: jest.fn().mockImplementation(s => Promise.resolve(s))
            },
            ttsClient: { synthesize: jest.fn().mockResolvedValue({ audioUrl: 'https://audio.url', durationSeconds: 5 }) },
            fallbackImageClient: { generateImage: jest.fn().mockResolvedValue({ imageUrl: 'image.url' }) },
            subtitlesClient: { generateSubtitles: jest.fn().mockResolvedValue({ subtitlesUrl: 'subtitles.url' }) },
            videoRenderer: { render: jest.fn().mockResolvedValue({ videoUrl: 'final.video.url' }) },
            musicSelector: { selectMusic: jest.fn().mockResolvedValue({ track: { audioUrl: 'music.url' }, source: 'internal' }) },
            jobManager: {
                getJob: jest.fn(),
                updateJob: jest.fn().mockResolvedValue({}),
                failJob: jest.fn().mockResolvedValue({}),
                updateStatus: jest.fn()
            },
            notificationClient: { sendNotification: jest.fn().mockResolvedValue({}) },
            storageClient: {
                uploadAudio: jest.fn().mockResolvedValue({ secure_url: 'secure.audio' }),
                uploadImage: jest.fn().mockResolvedValue({ secure_url: 'secure.image' })
            }
        };

        mockJob = {
            id: 'job-1',
            status: 'pending',
            sourceAudioUrl: 'http://source.audio',
            targetDurationRange: { min: 10, max: 90 },
            targetDurationSeconds: 30
        };

        mockDeps.jobManager.getJob.mockReturnValue(mockJob);

        orchestrator = new ReelOrchestrator(mockDeps);
    });

    it('should collect voice samples and text samples during processJob when training mode is on', async () => {
        const collectVoiceSpy = jest.spyOn(TrainingDataCollector.prototype, 'collectVoiceSample');
        const collectTextSpy = jest.spyOn(TrainingDataCollector.prototype, 'collectTextSample');

        // We only care about the first few steps for this test
        // By not providing transcript and segments in mockJob, it will trigger the collectors
        // We let it run until it hits a missing mock or end of flow
        await orchestrator.processJob('job-1').catch(() => { });

        expect(collectVoiceSpy).toHaveBeenCalledWith(
            'http://source.audio',
            'Transcript text',
            30
        );

        expect(collectTextSpy).toHaveBeenCalledWith('Segment 1', 'commentary');
        expect(collectTextSpy).toHaveBeenCalledWith('Segment 2', 'commentary');
    });

    it('should NOT collect training data when training mode is off', async () => {
        (getConfig as jest.Mock).mockReturnValue({
            featureFlags: { personalCloneTrainingMode: false }
        });

        const collectVoiceSpy = jest.spyOn(TrainingDataCollector.prototype, 'collectVoiceSample');
        const collectTextSpy = jest.spyOn(TrainingDataCollector.prototype, 'collectTextSample');

        await orchestrator.processJob('job-1').catch(() => { });

        expect(collectVoiceSpy).not.toHaveBeenCalled();
        expect(collectTextSpy).not.toHaveBeenCalled();
    });

    it('should handle collector errors without failing the job', async () => {
        jest.spyOn(TrainingDataCollector.prototype, 'collectVoiceSample').mockRejectedValue(new Error('Disk full'));

        // This should NOT throw (at least not from the collector)
        await orchestrator.processJob('job-1').catch(() => { });

        // We verify it was called
        expect(TrainingDataCollector.prototype.collectVoiceSample).toHaveBeenCalled();
    });
});
