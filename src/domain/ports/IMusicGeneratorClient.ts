import { Track } from '../entities/Track';

/**
 * MusicGenerationRequest for AI music generation.
 */
export interface MusicGenerationRequest {
    /** Description prompt for the AI (e.g., "ambient indian flute, meditation, no drums") */
    descriptionPrompt: string;
    /** Desired duration in seconds */
    durationSeconds: number;
    /** Whether the track should be instrumental only */
    instrumental?: boolean;
}

/**
 * IMusicGeneratorClient - Port for AI music generation services.
 * Implementations: SegmentMusicClient
 */
export interface IMusicGeneratorClient {
    /**
     * Generates music based on the request parameters.
     * This is typically a long-running operation that may involve polling.
     * @param request Generation parameters
     * @returns Generated track with audio URL
     */
    generateMusic(request: MusicGenerationRequest): Promise<Track>;
}
