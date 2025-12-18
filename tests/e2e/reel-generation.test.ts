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

describe('ReelOrchestrator E2E - Happy Path', () => {
    let orchestrator: ReelOrchestrator;
    let jobManager: JobManager;

    beforeEach(() => {
        // Setup nock to intercept all HTTP calls
        nock.cleanAll();

        // Mock audio file download (transcription downloads the file first)
        nock('https://example.com')
            .get('/voice-note.mp3')
            .reply(200, Buffer.from('fake-audio-data'));

        // Mock all mock-storage.example.com URLs (voiceover, music downloads)
        nock('https://mock-storage.example.com')
            .get(/.*/)
            .reply(200, Buffer.from('fake-audio-data'))
            .persist();

        // Mock OpenAI Transcription (Whisper) - returns plain text or SRT
        nock('https://api.openai.com')
            .post('/v1/audio/transcriptions')
            .reply(200, (uri: string, body: any) => {
                // Check if it's SRT format request (for subtitles)
                if (typeof body === 'string' && body.includes('response_format') && body.includes('srt')) {
                    return fs.readFileSync(path.join(__dirname, '../fixtures/responses/subtitles.srt'), 'utf-8');
                }
                // Otherwise return text (for transcription)
                return loadFixture('openai-transcription.json').text;
            })
            .persist();

        // Mock OpenAI LLM -  Multiple calls
        // First call: plan reel (returns JSON in content)
        nock('https://api.openai.com')
            .post('/v1/chat/completions', (body: any) =>
                body.messages[1].content.includes('plan a short-form video reel')
            )
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(loadFixture('openai-reel-plan.json'))
                    }
                }]
            });

        // Second call: generate segment content (returns array JSON in content)
        nock('https://api.openai.com')
            .post('/v1/chat/completions', (body: any) =>
                body.messages[1].content.includes('Create') && body.messages[1].content.includes('segments')
            )
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(loadFixture('openai-segment-content.json'))
                    }
                }]
            });

        // Third call: adjust commentary (optional - happens if duration mismatch)
        // Returns the same segments with adjusted commentary
        nock('https://api.openai.com')
            .post('/v1/chat/completions', (body: any) =>
                body.messages[1].content.includes('Adjust these segment commentaries')
            )
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(loadFixture('openai-segment-content.json'))
                    }
                }]
            })
            .persist();

        // Mock Fish Audio TTS
        nock('https://api.fish.audio')
            .post('/v1/tts')
            .reply(200, loadFixture('fish-audio-tts.json'));

        // Mock OpenAI DALL-E (3 image calls for 3 segments)
        nock('https://api.openai.com')
            .post('/v1/images/generations')
            .times(3)
            .reply(200, loadFixture('dall-e-image.json'));


        // Mock Shotstack - Submit render
        nock('https://api.shotstack.io')
            .post('/stage/render')
            .reply(200, loadFixture('shotstack-submit.json'));

        // Mock Shotstack - Poll status (returns done immediately)
        nock('https://api.shotstack.io')
            .get(/\/stage\/render\/.*/)
            .reply(200, loadFixture('shotstack-status-done.json'))
            .persist();

        // Initialize dependencies
        jobManager = new JobManager(10, 90);

        const transcriptionClient = new OpenAITranscriptionClient('test-key', 'https://api.openai.com');
        const llmClient = new OpenAILLMClient('test-key', 'gpt-4o', 'https://api.openai.com');
        const ttsClient = new FishAudioTTSClient('test-key', 'test-voice-id', 'https://api.fish.audio');
        const imageClient = new OpenAIImageClient('test-key', 'https://api.openai.com');
        const subtitlesClient = new OpenAISubtitlesClient('test-key', 'https://api.openai.com');
        const videoRenderer = new ShortstackVideoRenderer('test-key', 'https://api.shotstack.io/stage');

        // Create music catalog with test track
        const musicCatalog = new InMemoryMusicCatalogClient(
            path.join(__dirname, '../fixtures/responses/music-track.json')
        );
        const musicSelector = new MusicSelector(musicCatalog, null, null);

        const deps: OrchestratorDependencies = {
            transcriptionClient,
            llmClient,
            ttsClient,
            imageClient,
            subtitlesClient,
            videoRenderer,
            musicSelector,
            jobManager,
        };

        orchestrator = new ReelOrchestrator(deps);
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should generate reel end-to-end successfully', async () => {
        // Create a job
        const job = jobManager.createJob({
            sourceAudioUrl: 'https://example.com/voice-note.mp3',
            targetDurationRange: { min: 15, max: 45 },
        });

        expect(job.status).toBe('pending');
        expect(job.id).toMatch(/^job_/);

        // Process the job
        const result = await orchestrator.processJob(job.id);

        // Verify job completed successfully
        expect(result.status).toBe('completed');
        expect(result.finalVideoUrl).toBeDefined();
        expect(result.finalVideoUrl).toBe('https://mock-storage.example.com/final-video.mp4');

        // Verify all intermediate steps were populated
        expect(result.transcript).toBeDefined();
        expect(result.segments).toHaveLength(3);
        expect(result.voiceoverUrl).toBeDefined();
        expect(result.musicUrl).toBeDefined();
        expect(result.subtitlesUrl).toBeDefined();
        expect(result.manifest).toBeDefined();

        // Verify manifest structure
        expect(result.manifest?.segments).toHaveLength(3);
        expect(result.manifest?.voiceoverUrl).toBe('https://mock-storage.example.com/voiceover.mp3');
        expect(result.manifest?.musicUrl).toBe('https://mock-storage.example.com/music.mp3');
        expect(result.manifest?.subtitlesUrl).toContain('data:text/srt;base64'); // Subtitles are base64 encoded

        // Verify timestamps
        expect(result.createdAt).toBeDefined();
        expect(result.updatedAt).toBeDefined();
        expect(result.updatedAt.getTime()).toBeGreaterThanOrEqual(result.createdAt.getTime());

        // Verify no error
        expect(result.error).toBeUndefined();
    }, 30000); // 30s timeout for E2E test

    it('should update job status through all stages', async () => {
        const job = jobManager.createJob({
            sourceAudioUrl: 'https://example.com/voice-note.mp3'
        });

        const jobId = job.id;
        const statusUpdates: string[] = [];

        // Mock jobManager.updateStatus to capture state transitions
        const originalUpdateStatus = jobManager.updateStatus.bind(jobManager);
        jobManager.updateStatus = (id: string, status: any, step?: string) => {
            statusUpdates.push(status);
            return originalUpdateStatus(id, status, step);
        };

        await orchestrator.processJob(jobId);

        // Verify job went through expected stages
        expect(statusUpdates).toContain('transcribing');
        expect(statusUpdates).toContain('planning');
        expect(statusUpdates).toContain('generating_commentary');
        expect(statusUpdates).toContain('synthesizing_voiceover');
        expect(statusUpdates).toContain('selecting_music');
        expect(statusUpdates).toContain('generating_images');
        expect(statusUpdates).toContain('generating_subtitles');
        expect(statusUpdates).toContain('building_manifest');
        expect(statusUpdates).toContain('rendering');
    }, 30000);

    it('should call all external APIs exactly once (except images)', async () => {
        const job = jobManager.createJob({
            sourceAudioUrl: 'https://example.com/voice-note.mp3'
        });

        await orchestrator.processJob(job.id);

        // Verify all nock interceptors were called
        expect(nock.isDone()).toBe(true);
    }, 30000);
});
