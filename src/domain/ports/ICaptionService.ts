import { CaptionAndTags } from '../entities/Growth';

/**
 * Service for generating viral captions and hashtags.
 */
export interface ICaptionService {
    /**
     * Generates caption and hashtags based on the final script and summary.
     * @param fullScript Final voiceover script
     * @param summary Core story summary
     * @returns Optimized caption and hashtags
     */
    generateCaption(fullScript: string, summary: string): Promise<CaptionAndTags>;
}
