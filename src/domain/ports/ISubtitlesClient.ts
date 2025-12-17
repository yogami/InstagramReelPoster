/**
 * SubtitlesResult from subtitle generation.
 */
export interface SubtitlesResult {
    /** URL to the generated subtitles file */
    subtitlesUrl: string;
    /** Raw SRT content */
    srtContent: string;
    /** Format of the subtitles */
    format: 'srt' | 'vtt';
}

/**
 * ISubtitlesClient - Port for subtitle generation services.
 * Implementations: OpenAISubtitlesClient
 */
export interface ISubtitlesClient {
    /**
     * Generates subtitles from an audio file with timestamps.
     * @param audioUrl URL to the audio file
     * @returns Subtitles with URL and raw content
     */
    generateSubtitles(audioUrl: string): Promise<SubtitlesResult>;
}
