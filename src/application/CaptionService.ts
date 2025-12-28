import { ICaptionService } from '../domain/ports/ICaptionService';
import { CaptionAndTags } from '../domain/entities/Growth';
import { ILlmClient } from '../domain/ports/ILlmClient';

/**
 * Options for caption generation.
 */
export interface CaptionOptions {
    /** Series name for series mode (e.g., "One Hard Truth") */
    seriesName?: string;
    /** Series number for numeration (e.g., 3 for "Part 3") */
    seriesNumber?: number;
}

/**
 * Service for generating viral captions and hashtags.
 */
export class CaptionService implements ICaptionService {
    constructor(private readonly llmClient: ILlmClient) { }

    /**
     * Generates caption and hashtags based on the final script and summary.
     * @param fullScript - The full commentary script
     * @param summary - Brief summary of the reel content
     * @param options - Optional series info for series mode
     */
    async generateCaption(
        fullScript: string,
        summary: string,
        options?: CaptionOptions
    ): Promise<CaptionAndTags> {
        const result = await this.llmClient.generateCaptionAndTags(fullScript, summary);

        // Add series tag if series mode is active
        if (options?.seriesName && options?.seriesNumber) {
            const seriesTag = `#${options.seriesName.replace(/\s+/g, '')}`;
            const partLabel = `Part ${options.seriesNumber}`;

            // Prepend series label to caption
            result.captionBody = `${partLabel} | ${result.captionBody}`;

            // Add series hashtag if not already present
            if (!result.hashtags.includes(seriesTag)) {
                result.hashtags = [seriesTag, ...result.hashtags.slice(0, 10)];
            }

            result.seriesTag = seriesTag;
        }

        return result;
    }
}
