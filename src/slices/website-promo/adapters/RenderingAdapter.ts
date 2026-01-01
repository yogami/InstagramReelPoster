/**
 * Rendering Adapter
 * 
 * Bridges the slice's IRenderingPort to the existing video renderer infrastructure.
 */

import { IRenderingPort, RenderingAssets, RenderingResult } from '../ports/IRenderingPort';
import { PromoScriptPlan } from '../domain/entities/WebsitePromo';
import { IVideoRenderer } from '../../../domain/ports/IVideoRenderer';

export class RenderingAdapter implements IRenderingPort {
    constructor(private readonly videoRenderer: IVideoRenderer) { }

    async render(
        script: PromoScriptPlan,
        assets: RenderingAssets
    ): Promise<RenderingResult> {
        // Build manifest compatible with existing renderer
        const totalDuration = script.scenes.reduce((sum, s) => sum + s.duration, 0);

        const manifest = {
            durationSeconds: totalDuration,
            voiceoverUrl: assets.voiceoverUrl,
            musicUrl: assets.musicUrl,
            subtitlesUrl: assets.subtitlesUrl,
            segments: script.scenes.map((scene, i) => ({
                index: i,
                startSeconds: script.scenes.slice(0, i).reduce((sum, s) => sum + s.duration, 0),
                endSeconds: script.scenes.slice(0, i + 1).reduce((sum, s) => sum + s.duration, 0),
                imageUrl: assets.imageUrls[i],
                commentary: scene.narration,
                imagePrompt: scene.imagePrompt
            })),
            branding: assets.logoUrl ? {
                logoUrl: assets.logoUrl,
                businessName: script.businessName
            } : undefined
        };

        const result = await this.videoRenderer.render(manifest as any);

        return {
            videoUrl: result.videoUrl,
            renderId: result.renderId || 'legacy-render',
            durationSeconds: totalDuration
        };
    }
}
