/**
 * Website Promo Safe E2E Test
 * 
 * VALIDATES:
 * 1. Orchestration logic (Scrape -> Script -> Assets -> Render)
 * 2. Translation Fallback (DeepL error -> English fallback)
 * 3. Avatar Optimization (Pre-render + Voiceover URL passing)
 * 4. Enterprise Hardening (Resilience and Scalability wiring)
 * 
 * COST: $0.00 (Uses StressTest mocks)
 */

import { WebsitePromoOrchestrator } from '../../src/lib/website-promo/application/WebsitePromoOrchestrator';
import { WebsitePromoUseCase } from '../../src/lib/website-promo/application/WebsitePromoUseCase';
import {
    StressTestScraperMock,
    StressTestScriptMock,
    StressTestAssetMock,
    StressTestRenderingMock,
    StressTestAvatarMock,
    StressTestTranslationMock
} from '../../src/lib/website-promo/adapters/StressTestMocks';
import { InMemoryCacheAdapter } from '../../src/lib/website-promo/adapters/InMemoryCacheAdapter';
import { NoOpMetricsAdapter } from '../../src/lib/website-promo/adapters/ConsoleMetricsAdapter';
import { InMemoryTemplateRepository } from '../../src/lib/website-promo/adapters/InMemoryTemplateRepository';
import { FallbackTranslationAdapter, NoOpTranslationAdapter } from '../../src/lib/website-promo/adapters/FallbackTranslationAdapter';

describe('Website Promo - Safe Enterprise Validation (0-Cost)', () => {
    let orchestrator: WebsitePromoOrchestrator;
    let mockAvatarPort: StressTestAvatarMock;
    let mockTranslationPort: StressTestTranslationMock;

    beforeEach(() => {
        mockAvatarPort = new StressTestAvatarMock();
        mockTranslationPort = new StressTestTranslationMock();

        // Setup a resilient translation port for testing
        const translationPort = new FallbackTranslationAdapter(
            mockTranslationPort,
            new NoOpTranslationAdapter(),
            'Mock-Primary',
            'Safe-Fallback'
        );

        orchestrator = new WebsitePromoOrchestrator({
            scrapingPort: new StressTestScraperMock(),
            scriptPort: new StressTestScriptMock(),
            assetPort: new StressTestAssetMock(),
            renderingPort: new StressTestRenderingMock(),
            translationPort: translationPort,
            templateRepository: new InMemoryTemplateRepository(),
            cachePort: new InMemoryCacheAdapter(),
            metricsPort: new NoOpMetricsAdapter(),
            avatarPort: mockAvatarPort
        });
    });

    it('should complete a job using the full pipeline with mocks', async () => {
        const result = await orchestrator.processJob('safe_test_1', {
            websiteUrl: 'https://google.com',
            consent: true,
            avatarId: 'imelda-casual',
            language: 'de'
        });

        expect(result.status).toBe('completed');
        expect(result.result?.videoUrl).toBeDefined();
        // Check if translation was called (StressTestTranslationMock adds [STRESS-TEST] prefix)
        expect(result.result?.caption).toContain('[STRESS-TEST]');
    });

    it('should fall back to original text if translation service fails', async () => {
        // Force the primary translation to fail
        jest.spyOn(mockTranslationPort, 'translateBatch').mockRejectedValue(new Error('DeepL Throttled'));

        const result = await orchestrator.processJob('resilience_test_1', {
            websiteUrl: 'https://google.com',
            consent: true,
            language: 'de'
        });

        // Pipeline should still complete (Safe Degradation)
        expect(result.status).toBe('completed');
        // Fallback returns original text (from StressTestScriptMock)
        expect(result.result?.caption).toBe('Stress test successful #scale #tech');
    });

    it('should pass optimize avatar parameters (Voiceover URL and Pre-render Base)', async () => {
        const generateAvatarSpy = jest.spyOn(mockAvatarPort, 'generateAvatarVideo');

        await orchestrator.processJob('optimization_test_1', {
            websiteUrl: 'https://google.com',
            consent: true,
            avatarId: 'Imelda_Casual_Front_public'
        });

        expect(generateAvatarSpy).toHaveBeenCalled();
        const callArgs = generateAvatarSpy.mock.calls[0] as any;
        const config = callArgs[1];
        const audioUrl = callArgs[2];

        expect(config.preRenderedBaseUrl).toContain('imelda_casual_base.mp4');
        expect(audioUrl).toBe('https://mock.assets/silent_voice.mp3');
    });
});
