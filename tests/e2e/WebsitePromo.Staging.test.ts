import 'dotenv/config';
import { loadConfig } from '../../src/config';
import { createDependencies } from '../../src/presentation/app';
import Redis from 'ioredis';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/staging/image.png', public_id: 'staging_123' }),
            upload_large: jest.fn().mockResolvedValue({ secure_url: 'https://res.cloudinary.com/staging/image.png', public_id: 'staging_123' }),
            destroy: jest.fn().mockResolvedValue({ result: 'ok' })
        },
        url: jest.fn().mockReturnValue('https://res.cloudinary.com/staging/image.png')
    }
}));

// Mock process.exit to prevent test runner from exiting if some cleanup fails
const mockExit = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
    throw new Error(`Process.exit called with code ${code}`);
});

/**
 * WEBSITE PROMO STAGING E2E TEST
 */
describe('Website Promo - Staging System Verification (Safe)', () => {
    let deps: any;
    let slice: any;
    let redis: Redis | null = null;
    let isRedisUp = false;

    beforeAll(async () => {
        const config = loadConfig();
        config.featureFlags.enableWebsitePromoSlice = true;
        config.redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

        try {
            redis = new Redis(config.redisUrl, { connectTimeout: 1000, maxRetriesPerRequest: 0 });
            await redis.ping();
            isRedisUp = true;
            console.log('⚡ Staging Redis detected.');
            await redis.flushdb();
        } catch (err) {
            console.warn('⚠️  Redis is DOWN. Running in Direct mode.');
            config.redisUrl = '';
            redis = null;
        }

        mockedAxios.post.mockImplementation((url: string, data?: any) => {
            const urlStr = String(url);
            if (urlStr.includes('deepl.com')) {
                let batchSize = 1;
                if (data instanceof URLSearchParams) {
                    batchSize = data.getAll('text').length || 1;
                }
                const translations = Array(batchSize).fill(0).map(() => ({
                    text: '[Staging-DE] Translated Text ||| Split',
                    detected_source_language: 'EN'
                }));
                return Promise.resolve({ data: { translations } });
            }
            if (urlStr.includes('api.openai.com') || urlStr.includes('openrouter.ai')) {
                if (urlStr.includes('transcriptions')) {
                    return Promise.resolve({ data: '1\n00:00:00,000 --> 00:00:05,000\nStaging Subtitle' });
                }
                return Promise.resolve({
                    data: {
                        choices: [{
                            message: {
                                content: JSON.stringify({
                                    businessName: 'Staging Co',
                                    category: 'tech',
                                    coreMessage: 'Staging Logic Validated',
                                    scenes: [{ role: 'hook', narration: 'Narration 1', subtitle: 'Sub 1', duration: 5, imagePrompt: 'Prompt 1' }],
                                    musicStyle: 'techno',
                                    caption: 'Staging Caption'
                                })
                            }
                        }]
                    }
                });
            }
            if (urlStr.includes('heygen.com')) return Promise.resolve({ data: { data: { video_id: 'v1' } } });
            if (urlStr.includes('fish.audio')) {
                return Promise.resolve({
                    data: JSON.stringify({ audio_url: 'https://staging.assets/voiceover_job_123.mp3', duration: 10 }),
                    headers: { 'content-type': 'application/json' }
                });
            }
            if (urlStr.includes('cloudinary.com')) return Promise.resolve({ data: { secure_url: 'https://staging.png' } });
            if (urlStr.includes('shotstack.io')) return Promise.resolve({ data: { response: { id: 'r1' } } });
            if (urlStr.includes('api.beam.cloud')) return Promise.resolve({ data: { url: 'https://beam.mp4' } });

            return Promise.reject(new Error(`Unhandled mock POST URL: ${url}`));
        });

        mockedAxios.get.mockImplementation((url: string) => {
            const urlStr = String(url);
            if (urlStr.includes('heygen.com')) return Promise.resolve({ data: { data: { status: 'completed', video_url: 'https://staging.mp4' } } });
            if (urlStr.includes('shotstack.io')) return Promise.resolve({ data: { response: { status: 'done', url: 'https://staging.mp4' } } });
            if (urlStr.includes('stagingsite.com') || urlStr.includes('fallback-test.com')) return Promise.resolve({ data: '<html>Staging</html>' });
            if (urlStr.includes('pixabay.com/api')) return Promise.resolve({ data: { hits: [{ largeImageURL: 'https://pixabay.png' }] } });

            // For downloading audio files (subtitles generation)
            if (urlStr.includes('.mp3') || urlStr.includes('.wav')) {
                return Promise.resolve({ data: Buffer.alloc(100), headers: { 'content-type': 'audio/mpeg' } });
            }

            return Promise.resolve({ data: {} });
        });

        deps = createDependencies(config);
        slice = (deps.orchestrator as any).deps.websitePromoSlice;
    });

    afterAll(async () => {
        if (redis) await redis.quit();
        if (slice?.orchestrator?.deps?.jobQueuePort?.close) {
            await slice.orchestrator.deps.jobQueuePort.close();
        }
        mockExit.mockRestore();
    });

    it('should process a job using real wiring (safe)', async () => {
        const jobId = 'staging_job_' + Date.now();
        const result = await slice.orchestrator.processJob(jobId, {
            websiteUrl: 'https://stagingsite.com',
            consent: true,
            language: 'de',
            avatarId: 'imelda-staging'
        });
        expect(['processing', 'completed']).toContain(result.status);
    });

    it('should use the cache for repeated requests in staging', async () => {
        const cachePort = (slice.orchestrator as any).deps.cachePort;
        const testKey = 'staging_cache_test';
        const testVal = { ok: true };
        await cachePort.set(testKey, testVal);
        const retrieved = await cachePort.get(testKey);
        expect(retrieved).toEqual(testVal);
    });

    it('should respect the Translation Fallback in staging', async () => {
        mockedAxios.post.mockImplementationOnce(() => Promise.reject(new Error('Network Error')));
        const result = await (slice.orchestrator as any).useCase.execute({
            websiteUrl: 'https://fallback-test.com',
            consent: true,
            language: 'de'
        });
        expect(result).toBeDefined();
    });
});
