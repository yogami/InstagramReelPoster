import axios from 'axios';
import FormData from 'form-data';
import { ITranscriptionClient } from '../../domain/ports/ITranscriptionClient';

/**
 * OpenAI Whisper-based transcription client.
 * Uses the /v1/audio/transcriptions endpoint.
 */
export class OpenAITranscriptionClient implements ITranscriptionClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(apiKey: string, baseUrl: string = 'https://api.openai.com') {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
    }

    /**
     * Transcribes audio from a URL to text using OpenAI Whisper.
     * Downloads the audio file and sends it to OpenAI.
     */
    async transcribe(audioUrl: string): Promise<string> {
        if (!audioUrl) {
            throw new Error('Audio URL is required');
        }

        try {
            // Download the audio file
            const audioResponse = await axios.get(audioUrl, {
                responseType: 'arraybuffer',
            });

            // Determine file extension from URL or default to mp3
            const extension = this.getExtensionFromUrl(audioUrl) || 'mp3';
            const filename = `audio.${extension}`;

            // Create form data
            const formData = new FormData();
            formData.append('file', Buffer.from(audioResponse.data), {
                filename,
                contentType: this.getMimeType(extension),
            });
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'text');

            // Send to OpenAI
            const transcriptionResponse = await axios.post(
                `${this.baseUrl}/v1/audio/transcriptions`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                }
            );

            return transcriptionResponse.data.trim();
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`Transcription failed: ${message}`);
            }
            throw error;
        }
    }

    private getExtensionFromUrl(url: string): string | null {
        const match = url.match(/\.(\w+)(?:\?|$)/);
        return match ? match[1].toLowerCase() : null;
    }

    private getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            mp3: 'audio/mpeg',
            mp4: 'audio/mp4',
            m4a: 'audio/mp4',
            wav: 'audio/wav',
            ogg: 'audio/ogg',
            webm: 'audio/webm',
            flac: 'audio/flac',
        };
        return mimeTypes[extension] || 'audio/mpeg';
    }
}
