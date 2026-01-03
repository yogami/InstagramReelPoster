
import { CloudinaryReelRepository } from "./adapters/CloudinaryReelRepository";
import { ReplicateTrainingAdapter } from "./adapters/ReplicateTrainingAdapter";
import { ReplicateGenerationAdapter } from "./adapters/ReplicateGenerationAdapter";
import { PrepareDatasetUseCase } from "./application/PrepareDatasetUseCase";
import { TrainPersonaUseCase } from "./application/TrainPersonaUseCase";
import { GeneratePromoWithPersonaUseCase } from "./application/GeneratePromoWithPersonaUseCase";

export class PromoEngineFactory {
    static createPrepareDatasetUseCase(): PrepareDatasetUseCase {
        const reelRepo = new CloudinaryReelRepository();
        return new PrepareDatasetUseCase(reelRepo);
    }

    static createTrainPersonaUseCase(): TrainPersonaUseCase {
        const trainingService = new ReplicateTrainingAdapter();
        return new TrainPersonaUseCase(trainingService);
    }

    static createGeneratePromoUseCase(): GeneratePromoWithPersonaUseCase {
        const generationService = new ReplicateGenerationAdapter();
        return new GeneratePromoWithPersonaUseCase(generationService);
    }
}
