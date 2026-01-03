
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PromoEngineFactory } from '../../src/lib/promo-engine/PromoEngineFactory';
import { MockReelRepository } from '../../src/lib/promo-engine/adapters/MockReelRepository';
import { PrepareDatasetUseCase } from '../../src/lib/promo-engine/application/PrepareDatasetUseCase';
import { Dataset } from '../../src/lib/promo-engine/domain/Dataset';

import { TrainPersonaUseCase } from '../../src/lib/promo-engine/application/TrainPersonaUseCase';
import { MockTrainingService } from '../../src/lib/promo-engine/adapters/MockTrainingService';

import { MockGenerationService } from '../../src/lib/promo-engine/adapters/MockGenerationService';
import { GeneratePromoWithPersonaUseCase } from '../../src/lib/promo-engine/application/GeneratePromoWithPersonaUseCase';

describe('Promo Engine Feature (ATDD)', () => {
    let mockReelRepo: MockReelRepository;
    let mockTrainingService: MockTrainingService;
    let mockGenerationService: MockGenerationService;
    let prepareDatasetUseCase: PrepareDatasetUseCase;
    let trainPersonaUseCase: TrainPersonaUseCase;
    let generatePromoUseCase: GeneratePromoWithPersonaUseCase;

    beforeEach(() => {
        mockReelRepo = new MockReelRepository();
        mockTrainingService = new MockTrainingService();
        mockGenerationService = new MockGenerationService();

        prepareDatasetUseCase = new PrepareDatasetUseCase(mockReelRepo);
        trainPersonaUseCase = new TrainPersonaUseCase(mockTrainingService);
        generatePromoUseCase = new GeneratePromoWithPersonaUseCase(mockGenerationService);
    });

    it('should ingest reels and create a training dataset', async () => {
        // 1. Arrange: Existing reels in the repository
        const reelIds = ['reel_1', 'reel_2'];
        await mockReelRepo.addMockReel({ id: 'reel_1', url: 'http://example.com/1.mp4' });
        await mockReelRepo.addMockReel({ id: 'reel_2', url: 'http://example.com/2.mp4' });

        // 2. Act: Prepare a dataset named "custom_persona_v1"
        const dataset: Dataset = await prepareDatasetUseCase.execute({
            name: 'custom_persona_v1',
            sourceReelIds: reelIds,
        });

        // 3. Assert: Dataset is created with correct metadata
        expect(dataset).toBeDefined();
        expect(dataset.name).toBe('custom_persona_v1');
        expect(dataset.samples.length).toBeGreaterThan(0); // Should have extracted frames/samples
        expect(dataset.status).toBe('READY');

        // 4. Act: Train a new persona using this dataset
        const trainingJobId = await trainPersonaUseCase.execute({
            datasetId: dataset.id,
            trainingDataUrl: dataset.trainingDataUrl || '',
            modelName: 'my_custom_persona',
            triggerWord: 'ohwx'
        });

        // 5. Assert: Training job is started
        expect(trainingJobId).toBeDefined();
        const status = await mockTrainingService.getTrainingStatus(trainingJobId);
        expect(status).toBe('TRAINING');

        // 6. Act: Generate a promo video using the trained persona
        const promoUrl = await generatePromoUseCase.execute({
            modelName: 'my_custom_persona',
            prompt: 'A cinematic shot of ohwx drinking coffee in Berlin',
            aspectRatio: '9:16'
        });

        // 7. Assert: Promo video is generated
        expect(promoUrl).toBeDefined();
        expect(promoUrl).toContain('http');
    });
});
