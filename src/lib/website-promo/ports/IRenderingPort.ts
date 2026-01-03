/**
 * Rendering Port - Outbound interface for video rendering.
 * 
 * Abstracts video rendering capability, allowing the slice to work
 * with FFmpeg, Timeline API, or cloud rendering services.
 */

import { PromoScriptPlan } from '../domain/entities/WebsitePromo';

export interface RenderingAssets {
    /** Voiceover audio URL */
    voiceoverUrl: string;
    /** Background music URL */
    musicUrl?: string;
    /** Subtitles URL (SRT format) */
    subtitlesUrl?: string;
    /** Image URLs for each scene */
    imageUrls: string[];
    /** Logo URL for branding */
    logoUrl?: string;
    /** Optional avatar video overlay URL */
    avatarVideoUrl?: string;
}

export interface RenderingResult {
    /** Final video URL */
    videoUrl: string;
    /** Render job ID for tracking */
    renderId: string;
    /** Duration of rendered video */
    durationSeconds: number;
}

export interface IRenderingPort {
    /**
     * Renders a promotional video from assets and script.
     */
    render(
        script: PromoScriptPlan,
        assets: RenderingAssets
    ): Promise<RenderingResult>;
}
