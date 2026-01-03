
import Replicate from 'replicate';
import { IGenerationService, GenerationConfig } from "../ports/IGenerationService";
import { getConfig } from '../../../config';

export class ReplicateGenerationAdapter implements IGenerationService {
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

    async generateVideo(config: GenerationConfig): Promise<string> {
        console.log(`[Replicate] Generating image with custom model: ${config.modelName}`);

        // 1. Generate Image with Custom LoRA
        // We assume config.modelName is the full identifier "owner/model:version" or "owner/model"
        // Note: verify if modelName requires version hash for some endpoints
        const imageOutput = await this.replicate.run(
            config.modelName as any,
            {
                input: {
                    prompt: config.prompt,
                    aspect_ratio: config.aspectRatio === '9:16' ? '9:16' : '1:1',
                    output_format: "jpg",
                    num_outputs: 1
                }
            }
        ) as string[];

        const imageUrl = imageOutput[0];
        console.log(`[Replicate] Generated base image: ${imageUrl}`);

        // 2. Animate Image (Image-to-Video)
        // Using Stable Video Diffusion (or similar)
        console.log(`[Replicate] Animating image to video...`);
        const videoOutput = await this.replicate.run(
            "stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816f3afc9fccd55f58371b46da43778e8b981",
            {
                input: {
                    input_image: imageUrl,
                    video_length: "25_frames_with_svd_xt",
                    sizing_strategy: "maintain_aspect_ratio",
                    frames_per_second: 6
                }
            }
        ) as unknown as string;

        console.log(`[Replicate] Generated video: ${videoOutput}`);
        return videoOutput;
    }
}
