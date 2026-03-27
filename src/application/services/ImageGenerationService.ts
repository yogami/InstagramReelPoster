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
                console.warn(`Failed to persist turbo frame to Cloudinary fallback to local:`, err);
                imageUrl = await this.saveLocally(imageUrl, `turbo_${Date.now()}.png`);
            }
        } else {
            imageUrl = await this.saveLocally(imageUrl, `turbo_${Date.now()}.png`);
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

        // Upload to Cloudinary or save locally
        if (this.storageClient) {
            try {
                const uploadResult = await this.storageClient.uploadImage(finalImageUrl, {
                    folder: 'instagram-reels/images',
                    publicId: `segment_${jobId}_${index}`
                });
                finalImageUrl = uploadResult.url;
            } catch (uploadError) {
                console.warn(`Failed to upload segment ${index} to Cloudinary fallback to local:`, uploadError);
                finalImageUrl = await this.saveLocally(finalImageUrl, `segment_${jobId}_${index}.png`);
            }
        } else {
            finalImageUrl = await this.saveLocally(finalImageUrl, `segment_${jobId}_${index}.png`);
        }
        return { ...segment, imageUrl: finalImageUrl };
    }

    private async saveLocally(imageUrl: string, filename: string): Promise<string> {
        if (!imageUrl.startsWith('data:') && !imageUrl.startsWith('http')) {
            return imageUrl;
        }

        console.log(`[ImageGeneration] Saving image locally: ${filename}`);
        try {
            const fs = require('fs');
            const path = require('path');
            const axios = require('axios');
            const rendersDir = path.join(process.cwd(), 'public', 'renders');
            if (!fs.existsSync(rendersDir)) {
                fs.mkdirSync(rendersDir, { recursive: true });
            }
            const filePath = path.join(rendersDir, filename);

            if (imageUrl.startsWith('data:')) {
                const base64Data = imageUrl.split(';base64,').pop();
                fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
            } else {
                const response = await axios({ url: imageUrl, responseType: 'arraybuffer' });
                fs.writeFileSync(filePath, Buffer.from(response.data));
            }

            return `/renders/${filename}`;
        } catch (e: any) {
            console.error(`[ImageGeneration] Local save failed: ${e.message}`);
            return imageUrl;
        }
    }
}
