
import { IGenerationService } from "../ports/IGenerationService";

export interface GeneratePromoCommand {
    modelName: string;
    prompt: string;
    aspectRatio: string;
}

export class GeneratePromoWithPersonaUseCase {
    constructor(private generationService: IGenerationService) { }

    async execute(command: GeneratePromoCommand): Promise<string> {
        return this.generationService.generateVideo({
            modelName: command.modelName,
            prompt: command.prompt,
            aspectRatio: command.aspectRatio
        });
    }
}
