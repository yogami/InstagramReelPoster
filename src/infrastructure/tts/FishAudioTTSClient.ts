import axios from 'axios';
import { ITTSClient, TTSResult, TTSOptions } from '../../domain/ports/ITTSClient';

/**
 * Fish Audio TTS client for voice synthesis using the Yami voice clone.
 */
export class FishAudioTTSClient implements ITTSClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly voiceId: string;

    constructor(apiKey: string, voiceId: string, baseUrl: string = 'https://api.fish.audio') {
        if (!apiKey) {
            throw new Error('Fish Audio API key is required');
        }
        if (!voiceId) {
            throw new Error('Fish Audio voice ID is required');
        }
        this.apiKey = apiKey;
        this.voiceId = voiceId;
        this.baseUrl = baseUrl;
    }

    /**
     * Synthesizes text to speech using Fish Audio.
     */
    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            const response = await axios.post(
                `${this.baseUrl}/v1/tts`,
                {
                    text: text.trim(),
                    model_id: this.voiceId,
                    format: options?.format || 'mp3',
                    speed: options?.speed || 1.0,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    // Expect audio data in response
                    responseType: 'json',
                }
            );

            // The response structure may vary - adapt based on actual Fish Audio API
            // Expected response: { audio_url: string, duration_seconds: number }
            const audioUrl = response.data.audio_url || response.data.url;
            const durationSeconds = response.data.duration_seconds || response.data.duration;

            if (!audioUrl) {
                throw new Error('No audio URL in TTS response');
            }

            return {
                audioUrl,
                durationSeconds: durationSeconds || await this.estimateDuration(text, options?.speed),
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message ||
                    error.response?.data?.message ||
                    error.message;
                throw new Error(`TTS synthesis failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Estimates duration if not provided by API.
     * Uses ~2.3 words per second at normal speed.
     */
    private async estimateDuration(text: string, speed: number = 1.0): Promise<number> {
        const words = text.trim().split(/\s+/).length;
        const baseSeconds = words / 2.3;
        return baseSeconds / speed;
    }
}
