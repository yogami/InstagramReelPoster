import { ICaptionService } from '../domain/ports/ICaptionService';
import { CaptionAndTags } from '../domain/entities/Growth';
import { ILLMClient } from '../domain/ports/ILLMClient';

/**
 * Service for generating viral captions and hashtags.
 */
export class CaptionService implements ICaptionService {
    constructor(private readonly llmClient: ILLMClient) { }

    /**
     * Generates caption and hashtags based on the final script and summary.
     */
    async generateCaption(fullScript: string, summary: string): Promise<CaptionAndTags> {
        return this.llmClient.generateCaptionAndTags(fullScript, summary);
    }
}
