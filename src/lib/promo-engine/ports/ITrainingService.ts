
export interface TrainingConfig {
    datasetId: string;
    trainingDataUrl: string;
    modelName: string;
    triggerWord: string;
}

export type TrainingStatus = 'QUEUED' | 'TRAINING' | 'COMPLETED' | 'FAILED';

export interface ITrainingService {
    startTraining(config: TrainingConfig): Promise<string>; // Returns Job ID
    getTrainingStatus(jobId: string): Promise<TrainingStatus>;
}
