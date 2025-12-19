import axios from 'axios';
import { ITranscriptionClient } from '../../domain/ports/ITranscriptionClient';

/**
 * OpenRouter transcription client using Gemini 2.5 Flash for audio transcription.
 * Gemini accepts audio as base64 in the message content.
 * MUCH cheaper than Whisper: $0.0000003/token vs OpenAI's pricing.
 */
export class OpenRouterTranscriptionClient implements ITranscriptionClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(
        apiKey: string,
        model: string = 'google/gemini-2.5-flash',
        baseUrl: string = 'https://openrouter.ai/api/v1'
    ) {
        if (!apiKey) {
            throw new Error('OpenRouter API key is required');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    async transcribe(audioUrl: string): Promise<string> {
        console.log(`[OpenRouter Transcription] Starting transcription with ${this.model}...`);

        try {
            // Fetch the audio file
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
                timeout: 60000,
            });

            const audioBuffer = Buffer.from(audioResponse.data);
            const base64Audio = audioBuffer.toString('base64');

            // Determine audio MIME type
            const mimeType = this.getMimeType(audioUrl, audioResponse.headers['content-type']);

            console.log(`[OpenRouter Transcription] Audio fetched: ${(audioBuffer.length / 1024).toFixed(1)}KB, type: ${mimeType}`);

            // Send to Gemini for transcription
            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Please transcribe the following audio file. Return ONLY the transcription text, nothing else. No introductions, no explanations, just the exact words spoken in the audio.'
                            },
                            {
                                type: 'audio_url',
                                audio_url: {
                                    url: `data:${mimeType};base64,${base64Audio}`
                                }
                            }
                        ]
                    }],
                    temperature: 0.1,
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/yogami/InstagramReelPoster',
                        'X-Title': 'Instagram Reel Poster',
                    },
                    timeout: 120000,
                }
            );

            const transcription = response.data?.choices?.[0]?.message?.content?.trim();

            if (!transcription) {
                throw new Error('OpenRouter returned empty transcription');
            }

            console.log(`[OpenRouter Transcription] Transcription complete: ${transcription.length} chars`);

            return transcription;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error('[OpenRouter Transcription] Error:', error.response?.data);
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`Transcription failed: ${message}`);
            }
            throw error;
        }
    }

    private getMimeType(url: string, contentType?: string): string {
        if (contentType && contentType.includes('audio')) {
            return contentType.split(';')[0];
        }

        const ext = url.split('.').pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            'mp3': 'audio/mpeg',
            'wav': 'audio/wav',
            'ogg': 'audio/ogg',
            'm4a': 'audio/mp4',
            'flac': 'audio/flac',
            'webm': 'audio/webm',
        };

        return mimeTypes[ext || ''] || 'audio/mpeg';
    }
}
