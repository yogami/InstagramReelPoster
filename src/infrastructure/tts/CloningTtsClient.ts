import axios from 'axios';
import { ITtsClient, TTSResult, TTSOptions } from '../../domain/ports/ITtsClient';
import { getConfig } from '../../config';

/**
 * Voice Cloning TTS client for voice synthesis using the Yami voice clone.
 */
export class CloningTtsClient implements ITtsClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly voiceId: string;

    constructor(apiKey: string, voiceId: string, baseUrl: string = 'https://api.fish.audio') {
        if (!apiKey) {
            throw new Error('Voice Cloning API key is required');
        }
        if (!voiceId) {
            throw new Error('Voice Cloning voice ID is required');
        }
        this.apiKey = apiKey;
        this.voiceId = voiceId;
        this.baseUrl = baseUrl;
    }

    /**
     * Synthesizes text to speech using Voice Cloning.
     */
    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            const resolvedVoiceId = options?.voiceId || this.voiceId;
            console.log(`[Voice Cloning] Synthesizing with voice ID: ${resolvedVoiceId}`);
            const response = await axios.post(
                `${this.baseUrl}/v1/tts`,
                {
                    text: text.trim(),
                    reference_id: options?.voiceId || this.voiceId,
                    format: options?.format || 'mp3',
                    speed: options?.speed || 1.0,
                    pitch: options?.pitch || 1.0,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    // Expect audio data or JSON in response
                    responseType: 'arraybuffer',
                }
            );

            // Check if response is actually JSON (some proxies/versions return JSON)
            const contentType = response.headers['content-type'] || '';
            if (contentType.includes('application/json')) {
                const data = JSON.parse(Buffer.from(response.data).toString('utf-8'));
                const audioUrl = data.audio_url || data.url;
                const durationSeconds = data.duration_seconds || data.duration;

                if (!audioUrl) {
                    throw new Error('No audio URL in TTS JSON response');
                }

                return {
                    audioUrl,
                    durationSeconds: durationSeconds || await this.estimateDuration(text, options?.speed),
                };
            }

            // Treat as binary audio data
            const buffer = Buffer.from(response.data);
            const base64 = buffer.toString('base64');
            const audioUrl = `data:audio/${options?.format || 'mp3'};base64,${base64}`;

            return {
                audioUrl,
                durationSeconds: await this.estimateDuration(text, options?.speed),
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
        const config = getConfig();
        const words = text.trim().split(/\s+/).length;
        const baseSeconds = words / config.speakingRateWps;
        return baseSeconds / speed;
    }
}
