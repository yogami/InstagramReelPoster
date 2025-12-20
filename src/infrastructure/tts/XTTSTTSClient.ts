import axios from 'axios';
import { ITTSClient, TTSResult, TTSOptions } from '../../domain/ports/ITTSClient';
import { getConfig } from '../../config';

/**
 * XTTS v2 TTS Client for local voice cloning.
 * 
 * Uses a locally running XTTS v2 server (e.g., via Docker or Coqui TTS).
 * This allows using a custom-trained voice model that mimics the user's
 * voice, speech patterns, and personality.
 * 
 * @see https://github.com/coqui-ai/TTS
 */
export class XTTSTTSClient implements ITTSClient {
    private readonly serverUrl: string;
    private readonly speakerWav?: string;

    /**
     * Creates an XTTS TTS client.
     * @param serverUrl URL of the XTTS server (e.g., http://localhost:8020)
     * @param speakerWav Optional path/URL to speaker reference WAV file for voice cloning
     */
    constructor(serverUrl: string, speakerWav?: string) {
        if (!serverUrl) {
            throw new Error('XTTS server URL is required');
        }
        this.serverUrl = serverUrl.replace(/\/$/, ''); // Remove trailing slash
        this.speakerWav = speakerWav;
    }

    /**
     * Synthesizes text to speech using XTTS v2.
     * 
     * Supports multiple XTTS API formats:
     * - Coqui TTS server: POST /api/tts
     * - xtts-api-server: POST /tts_to_file
     */
    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            console.log(`[XTTS] Synthesizing with local XTTS server: ${this.serverUrl}`);

            // Try the Coqui TTS server format first (most common)
            const response = await axios.post(
                `${this.serverUrl}/api/tts`,
                {
                    text: text.trim(),
                    speaker_wav: this.speakerWav,
                    language: 'en',
                },
                {
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                    timeout: 120000, // 2 minutes for local TTS which can be slow
                }
            );

            // Convert audio buffer to base64 data URL
            const buffer = Buffer.from(response.data);
            const format = options?.format || 'wav';
            const audioUrl = `data:audio/${format};base64,${buffer.toString('base64')}`;

            // Calculate duration based on audio file size or estimate
            const durationSeconds = await this.estimateDuration(text, options?.speed);

            console.log(`[XTTS] Synthesized ${text.length} chars in ~${durationSeconds.toFixed(1)}s`);

            return {
                audioUrl,
                durationSeconds,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                // If Coqui format fails, try xtts-api-server format
                if (error.response?.status === 404) {
                    return this.synthesizeWithXttsApiServer(text, options);
                }

                const message = error.response?.data
                    ? Buffer.from(error.response.data).toString('utf-8')
                    : error.message;
                throw new Error(`XTTS synthesis failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Fallback to xtts-api-server format.
     */
    private async synthesizeWithXttsApiServer(text: string, options?: TTSOptions): Promise<TTSResult> {
        console.log(`[XTTS] Trying xtts-api-server format...`);

        const response = await axios.post(
            `${this.serverUrl}/tts_to_file`,
            {
                text: text.trim(),
                speaker_wav: this.speakerWav || 'default',
                language: 'en',
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                },
                responseType: 'json',
                timeout: 120000,
            }
        );

        // xtts-api-server returns a file path or URL
        const audioUrl = response.data.output_path || response.data.audio_url || response.data.url;

        if (!audioUrl) {
            throw new Error('No audio URL returned from XTTS server');
        }

        return {
            audioUrl,
            durationSeconds: await this.estimateDuration(text, options?.speed),
        };
    }

    /**
     * Estimates audio duration based on text length.
     * Uses ~2.3 words per second at normal speed (same as FishAudioTTSClient).
     */
    private async estimateDuration(text: string, speed: number = 1.0): Promise<number> {
        const config = getConfig();
        const words = text.trim().split(/\s+/).length;
        const baseSeconds = words / config.speakingRateWps;
        return baseSeconds / speed;
    }

    /**
     * Checks if the XTTS server is available.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.serverUrl}/`, { timeout: 5000 });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
