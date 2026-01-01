import nock from 'nock';
import { ReelOrchestrator, OrchestratorDependencies } from '../../src/application/ReelOrchestrator';
import { JobManager } from '../../src/application/JobManager';
import { WhisperTranscriptionClient } from '../../src/infrastructure/transcription/WhisperTranscriptionClient';
import { GptLlmClient } from '../../src/infrastructure/llm/GptLlmClient';
import { CloningTtsClient } from '../../src/infrastructure/tts/CloningTtsClient';
import { DalleImageClient } from '../../src/infrastructure/images/DalleImageClient';
import { WhisperSubtitlesClient } from '../../src/infrastructure/subtitles/WhisperSubtitlesClient';
import { TimelineVideoRenderer } from '../../src/infrastructure/video/TimelineVideoRenderer';
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
    jest.setTimeout(30000);
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

        // Mock Gpt LLM Plan request
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

        // Mock Gpt LLM Commentary request (Iterative: 3 calls)
        const segmentsFixture = loadFixture('openai-segment-content.json');
        nock('https://api.openai.com')
            .post('/v1/chat/completions', body => /spoken commentary for SEGMENT/i.test(body.messages[1].content))
            .reply(200, (uri, requestBody: any) => {
                const prompt = requestBody.messages[1].content;
                const match = prompt.match(/SEGMENT (\d+)/);
                const index = match ? parseInt(match[1], 10) - 1 : 0;
                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({ commentary: segmentsFixture[index]?.commentary || "Default commentary" })
                        }
                    }]
                };
            })
            .persist();

        // Mock Gpt LLM Visuals request (1 call)
        nock('https://api.openai.com')
            .post('/v1/chat/completions', body => /visual prompts for an Instagram Reel/i.test(body.messages[1].content))
            .reply(200, (uri, requestBody: any) => {
                const prompt = requestBody.messages[1].content;
                const match = prompt.match(/Segment (\d+):/g);
                const count = match ? match.length : segmentsFixture.length;

                return {
                    choices: [{
                        message: {
                            content: JSON.stringify(segmentsFixture.slice(0, count).map((s: any) => ({
                                imagePrompt: s.imagePrompt,
                                caption: s.caption,
                                continuityTags: s.continuityTags
                            })))
                        }
                    }]
                };
            })
            .persist();

        // Mock Gpt LLM Adjust Commentary request
        nock('https://api.openai.com')
            .post('/v1/chat/completions', body => /adjust.*commentaries/i.test(body.messages[1].content))
            .reply(200, (uri, requestBody: any) => {
                const prompt = requestBody.messages[1].content;
                const match = prompt.match(/Count: (\d+)/);
                const count = match ? parseInt(match[1], 10) : segmentsFixture.length;

                return {
                    choices: [{
                        message: {
                            content: JSON.stringify({ segments: segmentsFixture.slice(0, count) })
                        }
                    }]
                };
            })
            .persist();

        nock('https://api.fish.audio').post('/v1/tts').reply(200, loadFixture('fish-audio-tts.json')).persist();

        nock('https://api.openai.com').post('/v1/images/generations').reply(200, loadFixture('dall-e-image.json')).persist();

        nock('https://api.shotstack.io').post('/stage/render').reply(200, loadFixture('shotstack-submit.json')).persist();
        nock('https://api.shotstack.io').get(/\/stage\/render\/.*/).reply(200, loadFixture('shotstack-status-done.json')).persist();

        // 2. Setup Deps
        jobManager = new JobManager(10, 90);
        const transcriptionClient = new WhisperTranscriptionClient('test-key', 'https://api.openai.com');
        const llmClient = new GptLlmClient('test-key', 'gpt-4o', 'https://api.openai.com/v1');
        const ttsClient = new CloningTtsClient('test-key', 'test-voice-id', 'https://api.fish.audio');
        const fallbackImageClient = new DalleImageClient('test-key', 'https://api.openai.com');

        const mockStorageClient = {
            uploadRawContent: jest.fn().mockResolvedValue({ url: 'https://mock-storage.example.com/subtitles.srt' }),
            uploadImage: jest.fn().mockResolvedValue({ url: 'https://mock-storage.example.com/final-image.jpg' }),
            uploadVideo: jest.fn().mockResolvedValue({ url: 'https://mock-storage.example.com/final-video.mp4' }),
        } as any;

        const subtitlesClient = new WhisperSubtitlesClient('test-key', mockStorageClient, 'https://api.openai.com');
        const videoRenderer = new TimelineVideoRenderer('test-key', 'https://api.shotstack.io/stage');
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
            forceMode: 'direct'
        });

        const result = await orchestrator.processJob(job.id);
        expect(result.status).toBe('completed');
        expect(result.finalVideoUrl).toBe('https://mock-storage.example.com/final-video.mp4');
    });

    it('should fall back to ImageGen when MultiModel fails with text response', async () => {
        const { MultiModelImageClient } = require('../../src/infrastructure/images/MultiModelImageClient');
        const primaryImageClient = new MultiModelImageClient('test-key', 'google/gemini-2.5-flash', 'https://api.openrouter.ai/api/v1');

        // Simulate MultiModel returning text model response
        nock('https://api.openrouter.ai')
            .persist()
            .post(/.*/)
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
