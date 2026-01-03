
export interface GenerationConfig {
    modelName: string;
    prompt: string;
    aspectRatio: string;
}

export interface IGenerationService {
    generateVideo(config: GenerationConfig): Promise<string>; // Returns URL
}
