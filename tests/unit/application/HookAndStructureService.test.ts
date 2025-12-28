import { HookAndStructureService } from '../../../src/application/HookAndStructureService';
import { ILlmClient, ReelPlan } from '../../../src/domain/ports/ILlmClient';

describe('HookAndStructureService', () => {
    let llmClient: jest.Mocked<ILlmClient>;
    let service: HookAndStructureService;

    beforeEach(() => {
        llmClient = {
            generateHooks: jest.fn(),
        } as any;
        service = new HookAndStructureService(llmClient);
    });

    const mockPlan: ReelPlan = {
        targetDurationSeconds: 30,
        segmentCount: 6,
        musicTags: ['meditation'],
        musicPrompt: 'calm music',
        mood: 'calm',
        summary: 'A story about inner peace',
        mainCaption: 'Find your peace'
    };

    const mockTranscript = "We often seek peace outside ourselves but it's always within.";

    it('should generate a HookPlan with optimized duration and segment count', async () => {
        const mockHooks = ['The lie of external peace', 'Peace is a choice', 'Stop looking outside'];
        llmClient.generateHooks.mockResolvedValue(mockHooks);

        const result = await service.optimizeStructure(mockTranscript, mockPlan);

        expect(result.chosenHook).toBe(mockHooks[0]);
        expect(result.alternativeHooks).toEqual(mockHooks.slice(1));
        // Discovery bias: 30s should be reduced towards 10-20s if possible, 
        // but the service should decide based on content.
        // Let's assert it returns a valid structure.
        expect(result.targetDurationSeconds).toBeLessThanOrEqual(30);
        expect(result.segmentCount).toBeGreaterThanOrEqual(3); // Hook + Body + Payoff
        expect(result.segmentsHint).toHaveLength(result.segmentCount);
        expect(result.segmentsHint![0].role).toBe('hook');
        expect(result.segmentsHint![result.segmentsHint!.length - 1].role).toBe('payoff');
    });

    it('should bias towards shorter duration (10-20s) for discovery', async () => {
        llmClient.generateHooks.mockResolvedValue(['Hook']);

        const longPlan = { ...mockPlan, targetDurationSeconds: 60 };
        const result = await service.optimizeStructure(mockTranscript, longPlan, undefined, 'discovery');

        // Default discovery bias should clamp or reduce duration
        expect(result.targetDurationSeconds).toBeLessThan(60);
        expect(result.targetDurationSeconds).toBeGreaterThanOrEqual(10);
    });
});
