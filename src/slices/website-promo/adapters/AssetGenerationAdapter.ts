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

export class AssetGenerationAdapter implements IAssetGenerationPort {
    constructor(
        private readonly ttsClient: ITtsClient,
        private readonly imageClient: IImageClient,
        private readonly musicSelector: MusicSelector,
        private readonly subtitlesClient: ISubtitlesClient
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

        for (const scene of scenes) {
            const prompt = options?.style
                ? `${scene.imagePrompt}. Style: ${options.style}`
                : scene.imagePrompt;

            const result = await this.imageClient.generateImage(prompt);
            imageUrls.push(result.imageUrl);
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
