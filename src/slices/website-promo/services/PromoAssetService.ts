/**
 * Promo Asset Service (Slice Version)
 * 
 * Handles asset preparation for promo videos using slice ports.
 * This is the slice-local version that doesn't depend on main app infrastructure.
 */

import { PromoScriptPlan, PromoSceneContent, BusinessCategory, ScrapedMedia } from '../domain/entities/WebsitePromo';
import { IAssetGenerationPort, VoiceoverResult } from '../ports/IAssetGenerationPort';

export interface PromoAssetsResult {
    voiceoverUrl: string;
    voiceoverDuration: number;
    musicUrl?: string;
    musicDuration?: number;
    imageUrls: string[];
    subtitlesUrl?: string;
}

export interface PrepareAssetsOptions {
    script: PromoScriptPlan;
    targetDuration: number;
    language?: string;
    voiceId?: string;
    userProvidedMedia?: string[];
    scrapedMedia?: ScrapedMedia[];
}

export class PromoAssetService {
    constructor(private readonly assetPort: IAssetGenerationPort) { }

    /**
     * Prepares all assets needed for promo video rendering.
     */
    async prepareAssets(options: PrepareAssetsOptions): Promise<PromoAssetsResult> {
        const { script, targetDuration, language, voiceId, userProvidedMedia, scrapedMedia } = options;

        // 1. Generate voiceover from all scene narrations
        const fullNarration = script.scenes.map(s => s.narration).join(' ');
        const voiceover = await this.assetPort.generateVoiceover(fullNarration, {
            voiceId,
            language: language || script.language
        });

        // 2. Select music
        const music = await this.assetPort.selectMusic(
            script.category,
            voiceover.durationSeconds
        );

        // 3. Resolve and generate images
        const resolvedMedia = this.resolveMediaForScenes(
            script.scenes,
            userProvidedMedia || [],
            scrapedMedia || []
        );
        const imageUrls = await this.generateImagesWithPriority(
            script.scenes,
            resolvedMedia
        );

        // 4. Generate subtitles from voiceover
        const subtitlesUrl = await this.assetPort.generateSubtitles(voiceover.url);

        return {
            voiceoverUrl: voiceover.url,
            voiceoverDuration: voiceover.durationSeconds,
            musicUrl: music.url,
            musicDuration: music.durationSeconds,
            imageUrls,
            subtitlesUrl
        };
    }

    /**
     * Resolves media using priority: user-provided > scraped > AI generation
     */
    private resolveMediaForScenes(
        scenes: PromoSceneContent[],
        userMedia: string[],
        scrapedMedia: ScrapedMedia[]
    ): (string | null)[] {
        const resolved: (string | null)[] = [];
        let userIdx = 0;
        let scrapedIdx = 0;

        for (const scene of scenes) {
            if (userIdx < userMedia.length) {
                resolved.push(userMedia[userIdx++]);
            } else if (scrapedIdx < scrapedMedia.length) {
                resolved.push(scrapedMedia[scrapedIdx++].url);
            } else {
                resolved.push(null); // Will be AI-generated
            }
        }

        return resolved;
    }

    /**
     * Generates images, using pre-resolved URLs when available.
     */
    private async generateImagesWithPriority(
        scenes: PromoSceneContent[],
        resolvedMedia: (string | null)[]
    ): Promise<string[]> {
        const imageUrls: string[] = [];
        const scenesToGenerate: PromoSceneContent[] = [];
        const generateIndices: number[] = [];

        // Collect existing URLs and mark gaps for generation
        for (let i = 0; i < scenes.length; i++) {
            if (resolvedMedia[i]) {
                imageUrls[i] = resolvedMedia[i]!;
            } else {
                scenesToGenerate.push(scenes[i]);
                generateIndices.push(i);
            }
        }

        // Generate missing images
        if (scenesToGenerate.length > 0) {
            const generatedUrls = await this.assetPort.generateImages(scenesToGenerate);
            for (let i = 0; i < generatedUrls.length; i++) {
                imageUrls[generateIndices[i]] = generatedUrls[i];
            }
        }

        return imageUrls;
    }
}
