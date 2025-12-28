import 'dotenv/config';
import { getConfig } from '../src/config';
import { ReelOrchestrator } from '../src/application/ReelOrchestrator';
import { StockVideoClient } from '../src/infrastructure/video/StockVideoClient';
import { TimelineVideoRenderer } from '../src/infrastructure/video/TimelineVideoRenderer';
import { JobManager } from '../src/application/JobManager';
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient'; // Optional
import { IImageClient } from '../src/domain/ports/IImageClient';

// Mocks
const mockTranscriptionClient = {
    transcribe: async () => "Create an animated video about a calm forest river"
};

const mockLlmClient = {
    detectReelMode: async () => ({ isAnimatedVideoMode: true, storyline: "A peaceful journey through a forest river" }),
    planReel: async () => ({
        speech: "Welcome to the forest. Hear the river flow.",
        visuals: [],
        mood: "peaceful",
        mainCaption: "Forest Vibes",
        segmentCount: 1,
        targetDurationSeconds: 15
    }),
    adjustCommentaryLength: async (segments: any[], direction: string, duration: number) => segments,
    generateSegmentContent: async () => [{
        commentary: "Welcome to the forest. Hear the river flow and feel the peace.",
        imagePrompt: "Forest river", // Not used
        caption: "Forest Vibes"
    }],
};

const mockTtsClient = {
    synthesize: async () => ({
        audioUrl: "https://www2.cs.uic.edu/~i101/SoundFiles/BabyElephantWalk60.wav",
        durationSeconds: 10,
        wordCount: 10
    })
};

const mockSubtitlesClient = {
    generateSubtitles: async () => ({ subtitlesUrl: "https://media.w3.org/2010/05/sintel/captions.vtt" })
};

// Stateful Job Mock
const jobState: any = {
    id: 'live-test-job-1',
    sourceAudioUrl: 'http://test.com/source.mp3',
    status: 'pending',
    targetDurationRange: { min: 10, max: 20 },
    isAnimatedVideoMode: true,
    animatedVideoUrl: undefined
};

const mockJobManager = {
    getJob: async (id: string) => jobState,
    updateJob: async (id: string, updates: any) => {
        console.log(`[JobManager] Job updated: ${JSON.stringify(updates, null, 2)}`);
        Object.assign(jobState, updates);
    },
    updateStatus: async (id: string, status: string, step: string) => {
        console.log(`[JobManager] Status: ${status} - ${step}`);
        jobState.status = status;
    },
    failJob: async (id: string, error: Error) => {
        console.error(`[JobManager] Failed: ${error.message}`);
    }
};

const mockImageClient = {
    generateImage: async () => ({ imageUrl: "http://test.com/image.jpg" })
} as unknown as IImageClient;

async function run() {
    const config = getConfig();

    console.log("🚀 Starting End-to-End Animated Video Verification");

    // Real Components
    const pixabayClient = new StockVideoClient(config.pixabayApiKey || process.env.PIXABAY_API_KEY || '');
    const videoRenderer = new TimelineVideoRenderer(config.shotstackApiKey || process.env.SHOTSTACK_API_KEY || '');

    // Orchestrator with mixed Real/Mock deps
    const orchestrator = new ReelOrchestrator({
        transcriptionClient: mockTranscriptionClient as any,
        llmClient: mockLlmClient as any,
        ttsClient: mockTtsClient as any,
        primaryImageClient: mockImageClient,
        fallbackImageClient: mockImageClient,
        subtitlesClient: mockSubtitlesClient as any,
        videoRenderer: videoRenderer,
        animatedVideoClient: pixabayClient,
        jobManager: mockJobManager as unknown as JobManager,
        musicSelector: { selectMusic: async () => undefined } as any, // No music for simple test
        fallbackTtsClient: mockTtsClient as any,
    });

    try {
        await orchestrator.processJob('live-test-job-1');
        console.log("✅ Verification Complete!");
    } catch (err) {
        console.error("❌ Verification Failed:", err);
    }
}

run();
