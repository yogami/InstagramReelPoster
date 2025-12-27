/**
 * TTSResult represents the output from a TTS synthesis call.
 */
export interface TTSResult {
    /** URL to the generated audio file */
    audioUrl: string;
    /** Actual duration of the audio in seconds */
    durationSeconds: number;
}

/**
 * TTSOptions for customizing synthesis.
 */
export interface TTSOptions {
    /** Speed adjustment (0.9 - 1.1 range recommended) */
    speed?: number;
    /** Audio format (default: mp3) */
    format?: 'mp3' | 'wav' | 'ogg';
    /** Pitch adjustment (0.5 - 2.0 range, default 1.0) */
    pitch?: number;
    /** Optional voice ID override */
    voiceId?: string;
}

/**
 * ITTSClient - Port for Text-to-Speech services.
 * Implementations: FishAudioTTSClient
 */
export interface ITTSClient {
    /**
     * Synthesizes text to speech audio.
     * @param text The text to synthesize
     * @param options Optional TTS options (speed, format)
     * @returns Audio URL and actual duration
     */
    synthesize(text: string, options?: TTSOptions): Promise<TTSResult>;
}
