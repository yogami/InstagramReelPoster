/**
 * Asset Generation Adapter
 * 
 * Bridges the slice's IAssetGenerationPort to existing TTS, Image, and Music infrastructure.
 */

import { IAssetGenerationPort, VoiceoverResult } from '../ports/IAssetGenerationPort';
import { PromoSceneContent } from '../domain/entities/WebsitePromo';
import { ITtsClient } from '../../../domain/ports/ITtsClient';
import { IImageClient } from '../../../domain/ports/IImageClient';
import { MusicSelector } from '../../../application/MusicSelector';
import { ISubtitlesClient } from '../../../domain/ports/ISubtitlesClient';
import { MediaStorageClient } from '../../../infrastructure/storage/MediaStorageClient';

export class AssetGenerationAdapter implements IAssetGenerationPort {
    constructor(
        private readonly ttsClient: ITtsClient,
        private readonly imageClient: IImageClient,
        private readonly musicSelector: MusicSelector,
        private readonly subtitlesClient: ISubtitlesClient,
        private readonly storageClient: MediaStorageClient
    ) { }


    async generateVoiceover(
        text: string,
        options?: { voiceId?: string; language?: string }
    ): Promise<VoiceoverResult> {
        const result = await this.ttsClient.synthesize(text, options);

        // If it's a data URI, upload to Cloudinary to keep potential video rendering payload small
        if (result.audioUrl.startsWith('data:')) {
            console.log(`[AssetGeneration] TTS returned data URI (${(result.audioUrl.length / 1024).toFixed(1)} KB). Uploading to Cloudinary...`);
            const uploadResult = await this.storageClient.uploadFromUrl(result.audioUrl, {
                folder: 'website-promo/audio',
                resourceType: 'video', // Cloudinary treats audio as 'video' or 'auto'
                publicId: `tts_${Date.now()}`
            });
            return {
                url: uploadResult.url,
                durationSeconds: result.durationSeconds
            };
        }

        return {
            url: result.audioUrl,
            durationSeconds: result.durationSeconds
        };
    }


    async generateImages(
        scenes: PromoSceneContent[],
        options?: { style?: string }
    ): Promise<string[]> {
        const imageUrls: string[] = [];
        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            const prompt = scene.imagePrompt;

            // 1. Check if the "prompt" is actually already a URL or Data URI
            if (prompt.startsWith('http') || prompt.startsWith('data:')) {
                console.log(`[AssetGeneration] Scene ${i}: Using existing visual ${prompt.startsWith('data:') ? '(Data URI)' : '(URL)'}`);

                // Ensure it's in our Cloudinary for reliable rendering
                const uploadResult = await this.storageClient.uploadFromUrl(prompt, {
                    folder: 'website-promo/images',
                    publicId: `scene_${Date.now()}_${i}`,
                    tags: ['scraped', 'website-promo', scene.mediaIntent || 'visual'],
                    context: {
                        source_url: prompt.startsWith('http') ? prompt : 'data-uri',
                        scene_index: i
                    }
                });
                imageUrls.push(uploadResult.url);
                continue;
            }

            // 2. Otherwise, treat as an AI prompt and generate
            const styledPrompt = options?.style
                ? `${prompt}. Style: ${options.style}`
                : prompt;

            console.log(`[AssetGeneration] Scene ${i}: Generating AI image from prompt...`);
            const result = await this.imageClient.generateImage(styledPrompt);

            // Upload to Cloudinary with rich metadata
            const uploadResult = await this.storageClient.uploadFromUrl(result.imageUrl, {
                folder: 'website-promo/images',
                publicId: `scene_${Date.now()}_${i}`,
                tags: ['ai-generated', 'website-promo', scene.mediaIntent || 'visual'],
                context: {
                    prompt: styledPrompt.substring(0, 250),
                    style_preset: options?.style || 'general',
                    scene_index: i,
                    model: 'flux-standard'
                }
            });

            imageUrls.push(uploadResult.url);
        }

        return imageUrls;
    }

    async selectMusic(
        category: string,
        duration: number
    ): Promise<{ url: string; durationSeconds: number }> {
        const result = await this.musicSelector.selectMusic([category], duration, 'Website Promo');
        return {
            url: result?.track?.audioUrl || '',
            durationSeconds: result?.track?.durationSeconds || 0
        };
    }

    async generateSubtitles(audioUrl: string): Promise<string> {
        const result = await this.subtitlesClient.generateSubtitles(audioUrl);
        return result.subtitlesUrl;
    }
}
