/**
 * Website Promo E2E Test
 * 
 * This test uses the actual production dependency graph from app.ts
 * to verify that the slice is correctly integrated into the main system.
 * 
 * NO CHERRY-PICKING OR MOCKING.
 */

import { loadConfig } from '../../src/config';
import { createDependencies } from '../../src/presentation/app';

describe('Website Promo E2E (Production Wiring)', () => {
    let orchestrator: any;

    beforeAll(() => {
        const config = loadConfig();
        // Force the slice to be enabled for the test
        config.featureFlags.enableWebsitePromoSlice = true;

        const deps = createDependencies(config);

        // The orchestrator stores the slice in its deps
        // We can access it to verify integration
        orchestrator = (deps.orchestrator as any).deps.websitePromoSlice;
    });

    it('should have a correctly initialized slice in the production orchestrator', () => {
        expect(orchestrator).toBeDefined();
        expect(orchestrator.orchestrator).toBeDefined();
    });

    it('should be able to process a basic job throughout the entire pipeline', async () => {
        // We use a small site for relative speed, but real services
        const result = await orchestrator.orchestrator.processJob('e2e_test_123', {
            websiteUrl: 'https://example.com',
            consent: true,
            motionStyle: 'ken_burns'
        });

        // We check the status and structural integrity
        if (result.status === 'failed') {
            console.error('❌ E2E Job Failed:', result.error);
        }
        expect(result.status).toBe('completed');
        expect(result.result.videoUrl).toContain('http');
        expect(result.result.siteDNA).toBeDefined();
    }, 120000); // 2 minute timeout for real API calls
});
