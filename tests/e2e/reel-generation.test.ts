import nock from 'nock';
import { ReelOrchestrator, OrchestratorDependencies } from '../../src/application/ReelOrchestrator';
import { JobManager } from '../../src/application/JobManager';
import { OpenAITranscriptionClient } from '../../src/infrastructure/transcription/OpenAITranscriptionClient';
import { OpenAILLMClient } from '../../src/infrastructure/llm/OpenAILLMClient';
import { FishAudioTTSClient } from '../../src/infrastructure/tts/FishAudioTTSClient';
import { OpenAIImageClient } from '../../src/infrastructure/images/OpenAIImageClient';
import { OpenAISubtitlesClient } from '../../src/infrastructure/subtitles/OpenAISubtitlesClient';
import { ShortstackVideoRenderer } from '../../src/infrastructure/video/ShortstackVideoRenderer';
import { InMemoryMusicCatalogClient } from '../../src/infrastructure/music/InMemoryMusicCatalogClient';
import { MusicSelector } from '../../src/application/MusicSelector';
import fs from 'fs';
import path from 'path';

// Helper to load fixtures
function loadFixture(filename: string): any {
    const filePath = path.join(__dirname, '../fixtures/responses', filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    return filename.endsWith('.json') ? JSON.parse(content) : content.trim();
}

describe('ReelOrchestrator E2E', () => {
    let orchestrator: ReelOrchestrator;
    let jobManager: JobManager;
    let sharedDeps: OrchestratorDependencies;

    beforeEach(() => {
        nock.cleanAll();

        // 1. Mock infrastructure
        nock('https://example.com').get('/voice-note.mp3').reply(200, Buffer.from('fake-audio-data'));
        nock('https://mock-storage.example.com').get(/.*/).reply(200, Buffer.from('fake-audio-data')).persist();

        nock('https://api.openai.com')
            .post('/v1/audio/transcriptions')
            .reply(200, loadFixture('openai-transcription.json').text)
            .persist();

        // Mock OpenAI LLM Plan request
        nock('https://api.openai.com')
            .post('/v1/chat/completions', body => /plan.*reel/i.test(body.messages[1].content))
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(loadFixture('openai-reel-plan.json'))
                    }
                }]
            })
            .persist();

        // Mock OpenAI LLM Segments request
        nock('https://api.openai.com')
            .post('/v1/chat/completions', body => /segments/i.test(body.messages[1].content))
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(loadFixture('openai-segment-content.json'))
                    }
                }]
            })
            .persist();

        nock('https://api.fish.audio').post('/v1/tts').reply(200, loadFixture('fish-audio-tts.json')).persist();

        nock('https://api.openai.com').post('/v1/images/generations').reply(200, loadFixture('dall-e-image.json')).persist();

        nock('https://api.shotstack.io').post('/stage/render').reply(200, loadFixture('shotstack-submit.json')).persist();
        nock('https://api.shotstack.io').get(/\/stage\/render\/.*/).reply(200, loadFixture('shotstack-status-done.json')).persist();

        // 2. Setup Deps
        jobManager = new JobManager(10, 90);
        const transcriptionClient = new OpenAITranscriptionClient('test-key', 'https://api.openai.com');
        const llmClient = new OpenAILLMClient('test-key', 'gpt-4o', 'https://api.openai.com');
        const ttsClient = new FishAudioTTSClient('test-key', 'test-voice-id', 'https://api.fish.audio');
        const fallbackImageClient = new OpenAIImageClient('test-key', 'https://api.openai.com');

        const mockStorageClient = {
            uploadRawContent: jest.fn().mockResolvedValue({ url: 'https://mock-storage.example.com/subtitles.srt' }),
            uploadImage: jest.fn().mockResolvedValue({ url: 'https://mock-storage.example.com/final-image.jpg' }),
        } as any;

        const subtitlesClient = new OpenAISubtitlesClient('test-key', mockStorageClient, 'https://api.openai.com');
        const videoRenderer = new ShortstackVideoRenderer('test-key', 'https://api.shotstack.io/stage');
        const musicCatalog = new InMemoryMusicCatalogClient(path.join(__dirname, '../fixtures/responses/music-track.json'));
        const musicSelector = new MusicSelector(musicCatalog, null, null);

        sharedDeps = {
            transcriptionClient,
            llmClient,
            ttsClient,
            fallbackImageClient,
            subtitlesClient,
            videoRenderer,
            musicSelector,
            jobManager,
            storageClient: mockStorageClient,
        };

        orchestrator = new ReelOrchestrator(sharedDeps);
    });

    it('should generate reel end-to-end successfully', async () => {
        const job = await jobManager.createJob({
            sourceAudioUrl: 'https://example.com/voice-note.mp3',
            targetDurationRange: { min: 10, max: 15 },
        });

        const result = await orchestrator.processJob(job.id);
        expect(result.status).toBe('completed');
        expect(result.finalVideoUrl).toBe('https://mock-storage.example.com/final-video.mp4');
    });

    it('should fall back to DALL-E when OpenRouter fails with text response', async () => {
        const { OpenRouterImageClient } = require('../../src/infrastructure/images/OpenRouterImageClient');
        const primaryImageClient = new OpenRouterImageClient('test-key', 'google/gemini-2.5-flash', 'https://api.openrouter.ai/api/v1');

        // Simulate OpenRouter returning text model response
        nock('https://api.openrouter.ai')
            .post('/v1/chat/completions')
            .reply(200, {
                choices: [{ message: { content: 'I am a text model' } }]
            });

        const failingOrchestrator = new ReelOrchestrator({
            ...sharedDeps,
            primaryImageClient
        });

        const job = await jobManager.createJob({
            sourceAudioUrl: 'https://example.com/voice-note.mp3',
            targetDurationRange: { min: 5, max: 10 },
        });

        const result = await failingOrchestrator.processJob(job.id);
        expect(result.status).toBe('completed');
        expect(result.segments![0].imageUrl).toBeDefined();
    });
});
