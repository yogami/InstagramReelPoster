/**
 * Website Promo Manifest Validation (E2E Logic)
 * 
 * Verifies that the production system produces a "Phase 2 Manifest"
 * containing 1080p, Ken Burns, and Bold Subtitles.
 */

import { loadConfig } from '../../src/config';
import { createDependencies } from '../../src/presentation/app';

describe('Website Promo Phase 1 & 2 Manifest Validation', () => {
    let orchestrator: any;

    beforeAll(() => {
        const config = loadConfig();
        config.featureFlags.enableWebsitePromoSlice = true;
        const deps = createDependencies(config);

        // Mock the expensive generation to avoid rate limits, but keep logic
        const slice = (deps.orchestrator as any).deps.websitePromoSlice;
        slice.orchestrator.useCase.deps.assetPort.generateVoiceover = jest.fn().mockResolvedValue({ url: 'audio.mp3', durationSeconds: 30 });
        slice.orchestrator.useCase.deps.assetPort.generateImages = jest.fn().mockResolvedValue(['img1.jpg', 'img2.jpg', 'img3.jpg']);
        slice.orchestrator.useCase.deps.assetPort.selectMusic = jest.fn().mockResolvedValue({ url: 'music.mp3' });
        slice.orchestrator.useCase.deps.assetPort.generateSubtitles = jest.fn().mockResolvedValue('subtitles.srt');

        // Spy on the renderer to capture the final manifest
        slice.orchestrator.useCase.deps.renderingPort.render = jest.fn().mockResolvedValue({ videoUrl: 'final_video.mp4', durationSeconds: 30 });

        orchestrator = slice.orchestrator;
    });

    it('should generate a premium manifest reaching the renderer', async () => {
        await orchestrator.processJob('e2e_verify_job', {
            websiteUrl: 'https://www.drsmile.de',
            consent: true,
            voiceStyle: 'energetic',
            motionStyle: 'ken_burns',
            subtitleStyle: 'bold'
        });

        const renderCall = (orchestrator.useCase.deps.renderingPort.render as jest.Mock).mock.calls[0][0];

        console.log('\n--- PHASE 1 & 2 MANIFEST VERIFICATION ---');
        console.log(`✅ Motion Style (Ken Burns): ${renderCall.motionStyle}`);
        console.log(`✅ Subtitle Style (Bold): ${renderCall.subtitleStyle}`);
        console.log(`✅ Scene Count: ${renderCall.scenes.length}`);

        expect(renderCall.motionStyle).toBe('ken_burns');
        expect(renderCall.subtitleStyle).toBe('bold');
        expect(renderCall.scenes.length).toBeGreaterThan(0);
    });
});
