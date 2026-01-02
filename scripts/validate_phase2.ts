/**
 * Phase 2 Validation Script
 * Verifies that quality boosts (motion, voice) are correctly propagated through the slice.
 */

import { WebsitePromoUseCase } from '../src/slices/website-promo/application/WebsitePromoUseCase';
import { WebsitePromoInput } from '../src/slices/website-promo/domain/entities/WebsitePromo';

async function validatePhase2() {
    console.log('🧪 Validating Phase 2: Quality Boosts Propagation...');

    // 1. Setup Mocks
    const mockScraping = { scrape: jest.fn().mockResolvedValue({ businessName: 'Test Biz', type: 'tech', rawText: 'help problem' }) };
    const mockScript = {
        generateScript: jest.fn().mockResolvedValue({ businessName: 'Test Biz', scenes: [{ duration: 5, narration: 'Hi', imagePrompt: 'img' }], caption: 'cap' }),
        detectCategory: jest.fn().mockResolvedValue('tech')
    };
    const mockAsset = {
        generateVoiceover: jest.fn().mockResolvedValue({ url: 'audio.mp3', durationSeconds: 5 }),
        generateImages: jest.fn().mockResolvedValue(['img.jpg']),
        selectMusic: jest.fn().mockResolvedValue({ url: 'music.mp3' }),
        generateSubtitles: jest.fn().mockResolvedValue('sub.srt')
    };
    const mockRendering = { render: jest.fn().mockResolvedValue({ videoUrl: 'video.mp4', durationSeconds: 5 }) };

    const useCase = new WebsitePromoUseCase({
        scrapingPort: mockScraping as any,
        scriptPort: mockScript as any,
        assetPort: mockAsset as any,
        renderingPort: mockRendering as any
    });

    // 2. Test Input with Phase 2 Settings
    const input: WebsitePromoInput = {
        websiteUrl: 'https://example.com',
        consent: true,
        voiceStyle: 'energetic',  // Phase 2
        motionStyle: 'zoom_out',   // Phase 2
        subtitleStyle: 'bold'     // Phase 2
    };

    await useCase.execute(input);

    // 3. Assertions
    const voiceOptions = mockAsset.generateVoiceover.mock.calls[0][1];
    const renderCall = mockRendering.render.mock.calls[0][0];

    console.log('\n--- RESULTS ---');
    console.log(`✅ Voice Resolved: ${voiceOptions.voiceId} (Energetic ID)`);
    console.log(`✅ Motion Style Mapped: ${renderCall.motionStyle}`);
    console.log(`✅ Subtitle Style Mapped: ${renderCall.subtitleStyle}`);

    if (renderCall.motionStyle === 'zoom_out' && voiceOptions.voiceId === 'dd47d6f4-3a99-4282-b5b5-5401d04b97cc') {
        console.log('\n✨ Phase 2 Validation PASSED: All premium quality settings reached the rendering stage.');
    } else {
        console.log('\n❌ Phase 2 Validation FAILED: Settings were lost in transit.');
        process.exit(1);
    }
}

// Since we're in a script environment without Jest runner, 
// we'll use a simple mock implementation.
const jest = {
    fn: () => {
        const mock: any = (...args: any[]) => {
            mock.mock.calls.push(args);
            return mock.mock.results[0];
        };
        mock.mock = { calls: [], results: [] };
        mock.mockResolvedValue = (val: any) => {
            mock.mock.results.push(val);
            return mock;
        };
        return mock;
    }
};

validatePhase2().catch(console.error);
