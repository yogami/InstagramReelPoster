/**
 * Asset Generation Adapter
 * 
 * Bridges the slice's IAssetGenerationPort to existing TTS, Image, and Music infrastructure.
 */

import { IAssetGenerationPort, VoiceoverResult } from '../ports/IAssetGenerationPort';
import { PromoSceneContent } from '../domain/entities/WebsitePromo';

// Types for existing clients
interface LegacyTtsClient {
    synthesize(text: string, options?: any): Promise<{ url: string; durationSeconds: number }>;
}

interface LegacyImageClient {
    generateImage(prompt: string, options?: any): Promise<string>;
}

interface LegacyMusicSelector {
    selectMusic(category: string, targetDuration: number): Promise<{ url: string; durationSeconds: number }>;
}

interface LegacySubtitlesClient {
    generateSubtitles(audioUrl: string): Promise<{ subtitlesUrl: string }>;
}

export class AssetGenerationAdapter implements IAssetGenerationPort {
    constructor(
        private readonly ttsClient: LegacyTtsClient,
        private readonly imageClient: LegacyImageClient,
        private readonly musicSelector: LegacyMusicSelector,
        private readonly subtitlesClient: LegacySubtitlesClient
    ) { }

    async generateVoiceover(
        text: string,
        options?: { voiceId?: string; language?: string }
    ): Promise<VoiceoverResult> {
        const result = await this.ttsClient.synthesize(text, options);
        return {
            url: result.url,
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

            const url = await this.imageClient.generateImage(prompt);
            imageUrls.push(url);
        }

        return imageUrls;
    }

    async selectMusic(
        category: string,
        duration: number
    ): Promise<{ url: string; durationSeconds: number }> {
        return this.musicSelector.selectMusic(category, duration);
    }

    async generateSubtitles(audioUrl: string): Promise<string> {
        const result = await this.subtitlesClient.generateSubtitles(audioUrl);
        return result.subtitlesUrl;
    }
}
