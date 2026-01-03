
import Replicate from 'replicate';
import { ITrainingService, TrainingConfig, TrainingStatus } from "../ports/ITrainingService";
import { getConfig } from '../../../config';

export class ReplicateTrainingAdapter implements ITrainingService {
    private replicate: Replicate;

    constructor() {
        const config = getConfig();
        if (!config.replicateApiToken) {
            throw new Error("REPLICATE_API_TOKEN is not configured");
        }
        this.replicate = new Replicate({
            auth: config.replicateApiToken,
        });
    }

    async startTraining(config: TrainingConfig): Promise<string> {
        // Using Ostris's Flux trainer as default for "Controllable diffusion"
        // Destination needs to be created first or Replicate will error if it doesn't exist?
        // Actually, create method usually handles it or returns error.
        // For 2024 standards: we use flux-dev-lora-trainer
        const training = await this.replicate.trainings.create(
            "ostris",
            "flux-dev-lora-trainer",
            "e440909d3512c31646ee2e0c7d6f6f412c5f374d961917b69cebc3abee47c286",
            {
                // In production, we should probably prefix the model name with username
                // But for now, using the modelName as the name of the destination model
                // Note: user must own the destination model. 
                // We'll assume encoded in config.modelName is "username/modelname"
                destination: config.modelName as any,
                input: {
                    input_images: config.trainingDataUrl,
                    trigger_word: config.triggerWord,
                    steps: 1000,
                    lora_rank: 16,
                    optimizer: "adamw8bit",
                    batch_size: 1,
                    resolution: "512,768,1024",
                    autocaption: true
                } as any // casting to any because inputs vary by version
            }
        );

        return training.id;
    }

    async getTrainingStatus(jobId: string): Promise<TrainingStatus> {
        const training = await this.replicate.trainings.get(jobId);

        switch (training.status) {
            case 'succeeded': return 'COMPLETED';
            case 'failed': return 'FAILED';
            case 'canceled': return 'FAILED';
            case 'processing':
            case 'starting':
                return 'TRAINING';
            default: return 'QUEUED';
        }
    }
}
