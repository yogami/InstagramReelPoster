import axios from 'axios';
import { ITranscriptionClient } from '../../domain/ports/ITranscriptionClient';

/**
 * OpenRouter-based transcription client using Gemini.
 * Gemini models are excellent at transcribing long audio and video files.
 */
export class OpenRouterTranscriptionClient implements ITranscriptionClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(
        apiKey: string,
        model: string = 'google/gemini-2.0-flash-001',
        baseUrl: string = 'https://openrouter.ai/api/v1'
    ) {
        if (!apiKey) {
            throw new Error('OpenRouter API key is required');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    /**
     * Transcribes audio/video from a URL using Gemini via OpenRouter.
     */
    async transcribe(audioUrl: string): Promise<string> {
        if (!audioUrl) {
            throw new Error('Audio URL is required');
        }

        try {
            console.log(`[OpenRouter] Transcribing source (${this.model}): ${audioUrl}`);

            const response = await axios.post(
                `${this.baseUrl}/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                {
                                    type: 'text',
                                    text: 'Transcribe this audio/video file exactly. Provide ONLY the transcription text, no preamble or extra words.'
                                },
                                {
                                    type: 'image_url', // Standard multimodal field on OpenRouter
                                    image_url: {
                                        url: audioUrl
                                    }
                                }
                            ]
                        }
                    ],
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://github.com/yogami/InstagramReelPoster', // Recommended for OpenRouter
                        'X-Title': 'Instagram Reel Poster',
                    },
                    timeout: 60000, // Give it time to process
                }
            );

            if (!response.data || !response.data.choices || !response.data.choices[0]) {
                console.error('[OpenRouter] Unexpected response format:', JSON.stringify(response.data, null, 2));
                throw new Error('OpenRouter returned an invalid response structure');
            }

            const content = response.data.choices[0].message?.content;
            if (!content) {
                console.warn('[OpenRouter] Received empty content from model');
                throw new Error('OpenRouter model returned empty transcription');
            }

            console.log(`[OpenRouter] Transcription successful (${content.length} chars)`);
            return content.trim();
        } catch (error: any) {
            if (axios.isAxiosError(error) && error.response) {
                console.error('[OpenRouter] API Error:', JSON.stringify(error.response.data, null, 2));
                const message = error.response.data?.error?.message || error.message;
                throw new Error(`Transcription failed via OpenRouter: ${message}`);
            }
            console.error('[OpenRouter] Unexpected error:', error);
            throw error;
        }
    }
}
