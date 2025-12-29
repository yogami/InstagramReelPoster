
import nock from 'nock';
import { ReelOrchestrator } from '../../src/application/ReelOrchestrator';
import { JobManager } from '../../src/application/JobManager';
import { WebsiteScraperClient } from '../../src/infrastructure/scraper/WebsiteScraperClient';
import { GptLlmClient } from '../../src/infrastructure/llm/GptLlmClient';
import { TimelineVideoRenderer } from '../../src/infrastructure/video/TimelineVideoRenderer';
import { PromoAssetService } from '../../src/application/services/PromoAssetService';

describe('BerlinAILabs Promo Integration', () => {
    let orchestrator: ReelOrchestrator;
    let jobManager: JobManager;

    beforeEach(() => {
        nock.cleanAll();
        jobManager = new JobManager();

        // Mock the scraper for berlinailabs.de
        nock('https://berlinailabs.de')
            .get('/')
            .reply(200, `
                <html>
                    <head><title>Berlin AI Labs</title></head>
                    <body>
                        <img src="/logo.png" class="logo" alt="Berlin AI Labs">
                        <h1>Expert AI Engineering</h1>
                        <p>Contact: info@berlinailabs.de</p>
                    </body>
                </html>
            `)
            .get('/impressum')
            .reply(200, `
                <html>
                    <body>
                        <p>Address: Friedrichstraße 123, 10117 Berlin</p>
                        <p>Tel: +49 30 12345678</p>
                    </body>
                </html>
            `)
            .persist();

        // Mock LLM for promo plan
        nock('https://api.openai.com')
            .post('/v1/chat/completions')
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            coreMessage: "AI Solutions",
                            hookType: "Expertise",
                            scenes: [
                                { narration: "Welcome to Berlin AI Labs.", imagePrompt: "tech office", duration: 5, role: "intro" },
                                { narration: "Contact us today.", imagePrompt: "modern office", duration: 5, role: "cta" }
                            ],
                            caption: "AI Engineering experts.",
                            category: "service",
                            businessName: "Berlin AI Labs",
                            musicStyle: "tech",
                            language: "en",
                            compliance: {
                                source: "public-website",
                                consent: true,
                                scrapedAt: new Date()
                            }
                        })
                    }
                }]
            }).persist();

        const scraper = new WebsiteScraperClient();
        const llm = new GptLlmClient('fake-key');
        const renderer = new TimelineVideoRenderer('fake-key', 'https://api.timeline.io');

        // Mock renderer.render to capture the manifest
        jest.spyOn(renderer, 'render').mockImplementation(async (manifest) => {
            return { videoUrl: 'https://mock-storage.com/final.mp4', renderId: '123' };
        });

        const deps: any = {
            transcriptionClient: {} as any,
            llmClient: llm,
            ttsClient: { synthesize: async () => ({ audioUrl: 'v.mp3', durationSeconds: 10 }) } as any,
            fallbackImageClient: { generateImage: async () => ({ imageUrl: 'img.jpg' }) } as any,
            subtitlesClient: {} as any,
            videoRenderer: renderer,
            musicSelector: { selectMusic: async () => ({ url: 'm.mp3', duration: 60 }) } as any,
            jobManager,
            websiteScraperClient: scraper,
            storageClient: {
                uploadImage: async (url: string) => {
                    if (url.includes('/logo.png')) return { url: 'https://cloudinary.com/logo.jpg' };
                    return { url: 'img.jpg' };
                },
                uploadVideo: async () => ({ url: 'https://mock-storage.com/final.mp4' })
            } as any
        };

        orchestrator = new ReelOrchestrator(deps);
    });

    it('should generate a promo reel for berlinailabs.de with correct branding in manifest', async () => {
        const job = await jobManager.createJob({
            websitePromoInput: {
                websiteUrl: 'https://berlinailabs.de',
                businessName: 'Berlin AI Labs',
                consent: true
            }
        });

        await orchestrator.processJob(job.id);

        const updatedJob = await jobManager.getJob(job.id);
        const manifest = updatedJob?.manifest;

        expect(manifest).toBeDefined();
        expect(manifest?.branding).toBeDefined();

        // Verify contact info was picked up from both main and /impressum
        expect(manifest?.branding?.email).toBe('info@berlinailabs.de');
        expect(manifest?.branding?.address).toContain('Friedrichstraße 123');
        expect(manifest?.branding?.phone).toContain('49 30 12345678');

        // Verify logo was updated to the "permanent" storage version (simulating our upload fix)
        expect(manifest?.branding?.logoUrl).toBe('https://cloudinary.com/logo.jpg');

        // Verify the renderer was called with this branded manifest
        const renderer = (orchestrator as any).deps.videoRenderer;
        expect(renderer.render).toHaveBeenCalledWith(expect.objectContaining({
            branding: expect.objectContaining({
                email: 'info@berlinailabs.de',
                address: expect.stringContaining('Friedrichstraße 123'),
                phone: expect.stringContaining('49 30 12345678')
            })
        }));
    });
});
