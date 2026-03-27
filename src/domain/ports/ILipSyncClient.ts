/**
 * ILipSyncClient — Port for lip-sync animation providers.
 * Takes a character image + audio → produces animated video with lip-sync.
 *
 * Implementations:
 *  - MockLipSyncClient: FFmpeg overlay (free, for testing)
 *  - HedraLipSyncClient: Hedra Character-3 API (paid, production quality)
 */

export interface LipSyncParams {
    /** Path to the character image (PNG/JPG, portrait 9:16) */
    imagePath: string;
    /** Path to the audio file (MP3/WAV) */
    audioPath: string;
    /** Expected duration in seconds */
    durationSeconds: number;
    /** Optional character name for logging */
    characterName?: string;
}

export interface LipSyncResult {
    /** Path to the generated video file */
    videoPath: string;
    /** Actual duration of the generated video */
    durationSeconds: number;
}

export interface ILipSyncClient {
    /**
     * Generates an animated lip-sync video from a static image and audio.
     */
    generateLipSync(params: LipSyncParams): Promise<LipSyncResult>;
}
