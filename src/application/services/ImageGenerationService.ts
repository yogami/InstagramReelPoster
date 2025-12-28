import { IImageClient } from '../../domain/ports/IImageClient';
import { MediaStorageClient } from '../../infrastructure/storage/MediaStorageClient';
import { Segment } from '../../domain/entities/Segment';
import { JobManager } from '../JobManager';

/**
 * ImageGenerationService handles AI image generation with fallback.
 * Extracted from ReelOrchestrator to reduce complexity.
 */
export class ImageGenerationService {
    constructor(
        private readonly primaryClient: IImageClient,
        private readonly fallbackClient: IImageClient,
        private readonly storageClient?: MediaStorageClient,
        private readonly jobManager?: JobManager
    ) { }

    /**
     * Generates a single image with fallback and storage.
     */
    async generateImage(prompt: string, mood?: string): Promise<string> {
        const fullPrompt = mood ? `${prompt} Mood: ${mood}` : prompt;
        let imageUrl: string;

        try {
            const result = await this.primaryClient.generateImage(fullPrompt);
            imageUrl = result.imageUrl;
        } catch (err) {
            console.warn(`Primary image client failed, falling back:`, err);
            const result = await this.fallbackClient.generateImage(fullPrompt);
            imageUrl = result.imageUrl;
        }

        if (this.storageClient) {
            try {
                const uploadResult = await this.storageClient.uploadImage(imageUrl, {
                    folder: 'instagram-reels/turbo-frames',
                    publicId: `turbo_${Date.now()}`
                });
                imageUrl = uploadResult.url;
            } catch (err) {
                console.warn(`Failed to persist turbo frame to Cloudinary:`, err);
            }
        }

        return imageUrl;
    }

    /**
     * Generates images for all segments with fallback support.
     */
    async generateForSegments(segments: Segment[], jobId: string): Promise<Segment[]> {
        console.log(`Generating images for ${segments.length} segments...`);

        // Reset sequence if client supports it
        if ('resetSequence' in this.primaryClient) {
            (this.primaryClient as { resetSequence: () => void }).resetSequence();
        }

        const results: Segment[] = [];
        for (const segment of segments) {
            const updatedSegment = await this.generateSingleImage(segment, jobId, segments.length);
            results.push(updatedSegment);
        }

        // Wait for CDN propagation
        console.log('Waiting 2s for asset propagation...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        return results;
    }

    private async generateSingleImage(
        segment: Segment,
        jobId: string,
        totalSegments: number
    ): Promise<Segment> {
        const { index, imagePrompt } = segment;

        // Update job status
        if (this.jobManager) {
            await this.jobManager.updateJob(jobId, {
                currentStep: `Creating visual ${index + 1} of ${totalSegments}...`
            });
        }

        let finalImageUrl: string;

        try {
            const { imageUrl } = await this.primaryClient.generateImage(imagePrompt);
            finalImageUrl = imageUrl;
        } catch (primaryError) {
            console.warn(`Primary image client failed for segment ${index}, falling back:`, primaryError);
            const { imageUrl } = await this.fallbackClient.generateImage(imagePrompt);
            finalImageUrl = imageUrl;
        }

        // Upload to Cloudinary for persistence
        if (this.storageClient) {
            try {
                const uploadResult = await this.storageClient.uploadImage(finalImageUrl, {
                    folder: 'instagram-reels/images',
                    publicId: `segment_${jobId}_${index}`
                });
                finalImageUrl = uploadResult.url;
            } catch (uploadError) {
                console.warn(`Failed to upload segment ${index} to Cloudinary:`, uploadError);
            }
        }

        return { ...segment, imageUrl: finalImageUrl };
    }
}
