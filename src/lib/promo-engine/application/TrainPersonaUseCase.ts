
import { ITrainingService } from "../ports/ITrainingService";

export interface TrainPersonaCommand {
    datasetId: string;
    trainingDataUrl: string;
    modelName: string;
    triggerWord: string;
}

export class TrainPersonaUseCase {
    constructor(private trainingService: ITrainingService) { }

    async execute(command: TrainPersonaCommand): Promise<string> {
        // In a real app, we might validte the dataset exists here first
        return this.trainingService.startTraining({
            datasetId: command.datasetId,
            trainingDataUrl: command.trainingDataUrl,
            modelName: command.modelName,
            triggerWord: command.triggerWord
        });
    }
}
