import axios from 'axios';
import FormData from 'form-data';
import { ISubtitlesClient, SubtitlesResult } from '../../domain/ports/ISubtitlesClient';
import { CloudinaryStorageClient } from '../storage/CloudinaryStorageClient';

/**
 * OpenAI-based subtitles client that transcribes audio with timestamps.
 */
export class OpenAISubtitlesClient implements ISubtitlesClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly storageClient: CloudinaryStorageClient;
    private readonly maxRetries: number = 3;

    constructor(
        apiKey: string,
        storageClient: CloudinaryStorageClient,
        baseUrl: string = 'https://api.openai.com'
    ) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.storageClient = storageClient;
    }

    /**
     * Generates subtitles from an audio file with timestamps.
     */
    async generateSubtitles(audioUrl: string): Promise<SubtitlesResult> {
        if (!audioUrl) {
            throw new Error('Audio URL is required');
        }

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                // Determine file extension from URL or default to mp3
                const extension = this.getExtensionFromUrl(audioUrl) || 'mp3';
                const filename = `audio.${extension}`;

                // Download the audio file
                const audioResponse = await axios.get(audioUrl, {
                    responseType: 'arraybuffer',
                });

                // Create form data
                const formData = new FormData();
                formData.append('file', Buffer.from(audioResponse.data), {
                    filename,
                    contentType: this.getMimeType(extension),
                });
                formData.append('model', 'whisper-1');
                formData.append('response_format', 'srt');

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

                const srtContent = transcriptionResponse.data;

                // Upload SRT to Cloudinary instead of using data URL
                // This prevents "Payload Too Large" errors in video renderers
                const jobId = this.extractJobId(audioUrl);
                const uploadResult = await this.storageClient.uploadRawContent(
                    srtContent,
                    `subtitles_${jobId || Date.now()}.srt`,
                    { folder: 'instagram-reels/subtitles' }
                );

                return {
                    subtitlesUrl: uploadResult.url,
                    srtContent,
                    format: 'srt',
                };
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const message = error.response?.data?.error?.message || error.message;

                    if (this.shouldRetry(status, attempt)) {
                        const delay = Math.pow(2, attempt + 1) * 1000;
                        console.warn(`[Subtitles] Transient error (${status}), retrying in ${delay / 1000}s (Attempt ${attempt + 1}/${this.maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error(`Subtitle generation failed: ${message}`);
                }
                throw error;
            }
        }
        throw new Error('Subtitle generation failed after max retries');
    }

    private shouldRetry(status: number | undefined, attempt: number): boolean {
        return (status === 429 || status === 502 || status === 503 || status === 504) && attempt < this.maxRetries - 1;
    }

    private extractJobId(url: string): string | null {
        const match = url.match(/voiceover_(job_[^.]+)/);
        return match ? match[1] : null;
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
