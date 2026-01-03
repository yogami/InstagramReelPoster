/**
 * Asset Generation Port - Outbound interface for media asset creation.
 * 
 * Abstracts image generation, TTS synthesis, and music selection.
 */

import { PromoSceneContent } from '../domain/entities/WebsitePromo';

export interface VoiceoverResult {
    /** URL to generated audio */
    url: string;
    /** Actual duration in seconds */
    durationSeconds: number;
}

export interface IAssetGenerationPort {
    /**
     * Generates voiceover audio from text.
     */
    generateVoiceover(
        text: string,
        options?: { voiceId?: string; language?: string }
    ): Promise<VoiceoverResult>;

    /**
     * Generates images for promo scenes.
     */
    generateImages(
        scenes: PromoSceneContent[],
        options?: { style?: string }
    ): Promise<string[]>;

    /**
     * Selects background music based on category and mood.
     */
    selectMusic(
        category: string,
        duration: number
    ): Promise<{ url: string; durationSeconds: number }>;

    /**
     * Generates subtitles from audio URL.
     */
    generateSubtitles(audioUrl: string): Promise<string>;
}
