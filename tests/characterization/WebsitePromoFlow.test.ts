import nock from 'nock';
import { ReelOrchestrator, OrchestratorDependencies } from '../../src/application/ReelOrchestrator';
import { JobManager } from '../../src/application/JobManager';
import { GptLlmClient } from '../../src/infrastructure/llm/GptLlmClient';
import { EnhancedWebsiteScraper } from '../../src/infrastructure/scraper/EnhancedWebsiteScraper';

// Host-level config mock
jest.mock('../../src/config', () => ({
    getConfig: jest.fn(() => ({
        llmApiKey: 'test-api-key',
        openRouterApiKey: 'test-api-key',
        llmModel: 'gpt-4o',
        llmBaseUrl: 'https://api.openai.com/v1',
        featureFlags: { usePlaywrightScraper: false }
    }))
}));

describe('Website Promo Characterization Test', () => {
    let orchestrator: ReelOrchestrator;
    let jobManager: JobManager;
    let deps: OrchestratorDependencies;

    const MOCK_URL = 'http://it-actually-works.test';
    const TEST_API_KEY = 'test-api-key';

    beforeAll(() => {
        nock.disableNetConnect();
        nock.enableNetConnect(/(127.0.0.1|localhost)/);
    });

    afterAll(() => {
        nock.enableNetConnect();
    });

    beforeEach(() => {
        nock.cleanAll();

        // 1. Mock Website Content
        nock('http://it-actually-works.test')
            .persist()
            .get('/')
            .reply(200, `
                <html>
                    <head><title>Pizzeria Mario | Best Pizza Berlin</title></head>
                    <body>
                        <h1>Experience Authentic Italian Pizza</h1>
                        <p>Located in the heart of Kreuzberg, we serve traditional stone-baked pizza.</p>
                        <div class="contact">
                            <p>Call us: +49 30 1234567</p>
                            <p>Address: Alexanderplatz 1, 10178 Berlin</p>
                        </div>
                    </body>
                </html>
            `);

        // 2. Mock OpenAI API (Fallback for other services using nock)
        nock('https://api.openai.com')
            .persist()
            .post('/v1/chat/completions')
            .reply(200, (uri, body: any) => {
                const prompt = body.messages[1].content;
                if (prompt.includes('Extract structured contact')) {
                    return { choices: [{ message: { content: JSON.stringify({ businessName: 'Pizzeria Mario' }) } }] };
                }
                return { choices: [{ message: { content: JSON.stringify({ result: "default" }) } }] };
            });

        // Guardian Compliance Check
        nock('https://guardian-api.example.com')
            .persist()
            .post('/v1/scan')
            .reply(200, { approved: true, score: 0.98, auditId: 'audit-123', violations: [] });

        // 3. Setup Minimal Orchestrator
        jobManager = new JobManager();
        (jobManager as any).persistencePath = '/tmp/jobs_test.json';
        (jobManager as any).saveToDisk = jest.fn();

        const llmClient = new GptLlmClient(TEST_API_KEY, 'gpt-4o', 'https://api.openai.com');

        // Zero retries for predictability + Direct Mock Injection
        llmClient.llmService.chatCompletion = jest.fn().mockImplementation(async (prompt, system, options) => {
            if (prompt.includes('Extract structured contact')) {
                return JSON.stringify({ businessName: 'Pizzeria Mario' });
            }
            if (prompt.includes('primary category') || prompt.includes('Analyze this business website')) {
                return JSON.stringify({ category: 'restaurant', confidence: 0.9 });
            }
            if (prompt.includes('BLUEPRINT BEATS') || prompt.includes('blueprint')) {
                return JSON.stringify({
                    coreMessage: "Authentic Berlin Pizza",
                    caption: "Best pizza!",
                    hookType: "HOOK",
                    scenes: [
                        { role: 'hook', duration: 3, imagePrompt: "pizza", subtitle: "Hook", style: "cinematic_broll", narration: "Hook" },
                        { role: 'showcase', duration: 9, imagePrompt: "oven", subtitle: "Showcase", style: "cinematic_broll", narration: "Show" },
                        { role: 'cta', duration: 3, imagePrompt: "map", subtitle: "CTA", style: "cinematic_broll", narration: "CTA" }
                    ]
                });
            }
            return JSON.stringify({ result: "default" });
        });

        const videoRenderer = { render: jest.fn().mockResolvedValue({ videoUrl: 'https://cdn.com/final_promo.mp4' }) };

        // Mocking asset service to return objects WITH imageUrl to satisfy createReelManifest
        const promoAssetService = {
            preparePromoAssets: jest.fn().mockResolvedValue({
                voiceoverUrl: 'vo.mp3',
                voiceoverDuration: 15,
                musicUrl: 'music.mp3',
                segmentsWithImages: [
                    { index: 0, startSeconds: 0, endSeconds: 3, imageUrl: 'img1.jpg', caption: 'Hook' },
                    { index: 1, startSeconds: 3, endSeconds: 12, imageUrl: 'img2.jpg', caption: 'Showcase' },
                    { index: 2, startSeconds: 12, endSeconds: 15, imageUrl: 'img3.jpg', caption: 'CTA' }
                ]
            })
        };

        deps = {
            jobManager,
            llmClient,
            videoRenderer: videoRenderer as any,
            websiteScraperClient: new EnhancedWebsiteScraper(),
            notificationClient: { sendNotification: jest.fn() } as any,
            storageClient: { uploadVideo: jest.fn().mockResolvedValue({ url: 'https://cdn.com/final_promo_perm.mp4' }) } as any,
            complianceClient: { scanScript: jest.fn().mockResolvedValue({ approved: true, score: 0.9, auditId: '123', violations: [] }) } as any
        } as any;

        orchestrator = new ReelOrchestrator(deps);
        (orchestrator as any).promoAssetService = promoAssetService;
    });

    it('Scenario: URL to Promo Reel complete flow (Characterization)', async () => {
        const job = await jobManager.createJob({
            websitePromoInput: {
                websiteUrl: MOCK_URL,
                consent: true,
                language: 'en'
            }
        });

        const result = await orchestrator.processJob(job.id);

        expect(result.status).toBe('completed');
        expect(result.websiteAnalysis?.detectedBusinessName).toBe('Pizzeria Mario');
        expect(result.promoScriptPlan?.coreMessage).toBe('Authentic Berlin Pizza');
        expect(result.finalVideoUrl).toBe('https://cdn.com/final_promo_perm.mp4');
    });
});
