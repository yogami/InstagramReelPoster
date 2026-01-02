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
            const prompt = options?.style
                ? `${scene.imagePrompt}. Style: ${options.style}`
                : scene.imagePrompt;

            const result = await this.imageClient.generateImage(prompt);

            // Upload to Cloudinary to provide a clean URL for the renderer (avoids 'Payload Too Large' errors in Shotstack)
            const uploadResult = await this.storageClient.uploadFromUrl(result.imageUrl, {
                folder: 'website-promo/images',
                publicId: `scene_${Date.now()}_${i}`
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
