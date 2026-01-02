/**
 * Avatar Generation Port Interface
 * 
 * Defines the contract for AI avatar video generation services.
 * Future implementations: HeyGen, D-ID, Synthesia, etc.
 * 
 * NOTE: This is a placeholder interface. Full implementation deferred to Phase 5.
 */

export type AvatarExpression = 'neutral' | 'happy' | 'serious' | 'excited' | 'calm';
export type AvatarGender = 'male' | 'female' | 'neutral';
export type AvatarStyle = 'professional' | 'casual' | 'creative';

export interface AvatarConfig {
    /** Pre-defined avatar identifier */
    avatarId: string;
    /** Override voice ID (uses avatar default if not specified) */
    voiceId?: string;
    /** URL to pre-rendered base video for lip-sync optimization */
    preRenderedBaseUrl?: string;
    /** Facial expression during speech */
    expression?: AvatarExpression;
    /** Background type */
    background?: 'transparent' | 'office' | 'studio' | 'custom';
    /** Custom background image URL (if background is 'custom') */
    backgroundUrl?: string;
    /** Output resolution */
    resolution?: '720p' | '1080p' | '4k';
}

export interface AvatarVideoResult {
    /** URL to the generated avatar video */
    videoUrl: string;
    /** Duration of the video in seconds */
    durationSeconds: number;
    /** Render job ID for status tracking */
    renderId?: string;
}

export interface AvailableAvatar {
    id: string;
    name: string;
    gender: AvatarGender;
    style: AvatarStyle;
    previewUrl: string;
    voiceId: string;
}

export interface IAvatarGenerationPort {
    /**
     * Generate a talking avatar video.
     * @param script - The narration text (optional if audioUrl is provided)
     * @param config - Avatar configuration options
     * @param audioUrl - Optional pre-generated audio for lip-sync (more efficient)
     */
    generateAvatarVideo(script: string, config: AvatarConfig, audioUrl?: string): Promise<AvatarVideoResult>;

    /**
     * List available avatars.
     */
    listAvatars(): Promise<AvailableAvatar[]>;

    /**
     * Check if the avatar service is available/healthy.
     */
    healthCheck(): Promise<boolean>;
}
