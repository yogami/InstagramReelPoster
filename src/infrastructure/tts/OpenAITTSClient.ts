import axios from 'axios';
import { ITTSClient, TTSResult, TTSOptions } from '../../domain/ports/ITTSClient';

/**
 * OpenAI TTS client as a fallback for voice synthesis.
 */
export class OpenAITTSClient implements ITTSClient {
    private readonly apiKey: string;
    private readonly voice: string;

    constructor(apiKey: string, voice: string = 'alloy') {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = apiKey;
        this.voice = voice;
    }

    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            const response = await axios.post(
                'https://api.openai.com/v1/audio/speech',
                {
                    model: 'tts-1',
                    input: text.trim(),
                    voice: this.voice,
                    response_format: options?.format || 'mp3',
                    speed: options?.speed || 1.0,
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                }
            );

            const buffer = Buffer.from(response.data);
            const base64 = buffer.toString('base64');
            const audioUrl = `data:audio/${options?.format || 'mp3'};base64,${base64}`;

            return {
                audioUrl,
                durationSeconds: await this.estimateDuration(text, options?.speed),
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`OpenAI TTS fallback failed: ${message}`);
            }
            throw error;
        }
    }

    private async estimateDuration(text: string, speed: number = 1.0): Promise<number> {
        const words = text.trim().split(/\s+/).length;
        // OpenAI TTS is typically around 140-160 WPM
        const baseSeconds = words / (150 / 60);
        return baseSeconds / speed;
    }
}
