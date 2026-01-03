
import { ITrainingService, TrainingConfig, TrainingStatus } from "../ports/ITrainingService";
import { v4 as uuidv4 } from 'uuid';

export class MockTrainingService implements ITrainingService {
    private jobs: Map<string, TrainingStatus> = new Map();

    async startTraining(config: TrainingConfig): Promise<string> {
        const jobId = uuidv4();
        console.log(`Starting mock training for model ${config.modelName} from ${config.trainingDataUrl} with trigger ${config.triggerWord}`);
        this.jobs.set(jobId, 'TRAINING');
        return jobId;
    }

    async getTrainingStatus(jobId: string): Promise<TrainingStatus> {
        return this.jobs.get(jobId) || 'FAILED';
    }
}
