
import { IGenerationService, GenerationConfig } from "../ports/IGenerationService";

export class MockGenerationService implements IGenerationService {
    async generateVideo(config: GenerationConfig): Promise<string> {
        console.log(`Generating video with model ${config.modelName} for prompt: "${config.prompt}"`);
        return 'http://mock-storage.com/generated_video.mp4';
    }
}
