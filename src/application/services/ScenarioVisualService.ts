import { IImageClient } from '../../domain/ports/IImageClient';
import { IAnimatedVideoClient } from '../../domain/ports/IAnimatedVideoClient';
import { ScenarioScript } from '../../domain/entities/ScenarioScript';

/**
 * ScenarioVisualService generates the background visual for scenario reels.
 *
 * Priority:
 * 1. Kie.ai (Kling) animated video (9:16 vertical)
 * 2. Static image + Ken Burns zoom — fallback
 */
export class ScenarioVisualService {
    constructor(
        private readonly imageClient: IImageClient,
        private readonly animatedVideoClient?: IAnimatedVideoClient
    ) { }

    /**
     * Generates the background visual (video or image).
     * Returns { url, type } where type is 'video' or 'image'.
     */
    async generateScene(script: ScenarioScript): Promise<{ url: string; type: 'video' | 'image' }> {
        const maleChar = script.characters.find(c => c.gender === 'male');
        const femaleChar = script.characters.find(c => c.gender === 'female');
        const maleName = maleChar?.name || 'Him';
        const femaleName = femaleChar?.name || 'Her';

        // Try animated video first (e.g. Kie.ai Kling)
        if (this.animatedVideoClient) {
            try {
                const videoPrompt = this.buildVideoPrompt(script, maleName, femaleName);
                console.log(`[ScenarioVisual] Generating animated video for "${script.title}"...`);

                const result = await this.animatedVideoClient.generateAnimatedVideo({
                    theme: videoPrompt,
                    durationSeconds: 10, // Standard segment length
                    mood: this.getMoodKeywords(script.topic)
                });

                console.log(`[ScenarioVisual] Animated video generated: ${result.videoUrl}`);
                return { url: result.videoUrl, type: 'video' };
            } catch (err) {
                console.warn(`[ScenarioVisual] Animated video generation failed, falling back to static image:`, err);
            }
        }

        // Fallback: static image
        const imagePrompt = this.buildImagePrompt(script, maleName, femaleName);
        console.log(`[ScenarioVisual] Generating scene image for "${script.title}"...`);

        const result = await this.imageClient.generateImage(imagePrompt, {
            size: '1024x1792',
            style: 'natural',
        });

        console.log(`[ScenarioVisual] Scene image generated: ${result.imageUrl.substring(0, 60)}...`);
        return { url: result.imageUrl, type: 'image' };
    }

    /**
     * Builds animated video prompt — emphasizes motion and animation.
     */
    private buildVideoPrompt(script: ScenarioScript, maleName: string, femaleName: string): string {
        const moodKeywords = this.getMoodKeywords(script.topic);

        return [
            'Smooth cinematic animation, 2D digital art style',
            'Two young adults having a deep conversation in a stylish modern apartment',
            `Young man with relaxed, thoughtful posture, wearing casual dark clothing`,
            `Young woman sitting across, expressive animated gestures and body language`,
            'Subtle character animation: breathing, gesturing, shifting posture',
            'Ambient moody lighting with deep blue and gray tones, soft lamp glow',
            'Camera slowly panning or gently drifting around the scene',
            'Modern interior with couch, abstract wall art, large windows showing night city',
            'Vertical 9:16 portrait orientation, Instagram reel format',
            moodKeywords,
            'No text overlays, cinematic composition, editorial illustration style',
        ].join('. ');
    }

    /**
     * Builds static image prompt (fallback).
     */
    private buildImagePrompt(script: ScenarioScript, maleName: string, femaleName: string): string {
        const moodKeywords = this.getMoodKeywords(script.topic);

        return [
            '2D flat vector illustration, digital art style',
            'Two characters in a modern stylish apartment living room',
            `Young man (${maleName}) with relaxed confident posture, wearing casual dark clothing`,
            `Young woman (${femaleName}) sitting across from him, expressive body language`,
            'Moody ambient lighting with deep blue and gray tones',
            'Modern interior: couch, abstract art on walls, soft lamp light',
            'Vertical portrait orientation 9:16 aspect ratio',
            'Clean illustration style similar to editorial cartoon art',
            moodKeywords,
            'No text in the image, cinematic composition',
        ].join(', ');
    }

    /**
     * Returns mood-specific visual keywords based on the topic.
     */
    private getMoodKeywords(topic: string): string {
        const topicLower = topic.toLowerCase();
        if (topicLower.includes('paradox') || topicLower.includes('boring')) {
            return 'contemplative mood, evening light filtering through blinds';
        }
        if (topicLower.includes('loyalty') || topicLower.includes('stay')) {
            return 'tense atmosphere, dramatic shadows, cool blue palette';
        }
        if (topicLower.includes('attachment') || topicLower.includes('anxiety')) {
            return 'warm-cool contrast, intimate but distant positioning';
        }
        return 'sophisticated mood lighting, urban night atmosphere through windows';
    }
}
