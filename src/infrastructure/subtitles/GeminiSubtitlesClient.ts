import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { ISubtitlesClient, SubtitlesResult } from '../../domain/ports/ISubtitlesClient';
import { MediaStorageClient } from '../storage/MediaStorageClient';

/**
 * Gemini-based subtitles client that transcribes audio with timestamps in SRT format.
 * Eliminates OpenAI Whisper dependency/costs.
 */
export class GeminiSubtitlesClient implements ISubtitlesClient {
    private readonly genAI: GoogleGenerativeAI;
    private readonly modelName: string;
    private readonly storageClient: MediaStorageClient;

    constructor(
        apiKey: string,
        storageClient?: MediaStorageClient,
        modelName: string = 'gemini-1.5-flash'
    ) {
        if (!apiKey) {
            throw new Error('Google API key is required for Gemini subtitles');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName;
        this.storageClient = storageClient!;
    }

    /**
     * Generates subtitles from an audio URL using Gemini.
     */
    async generateSubtitles(audioUrl: string): Promise<SubtitlesResult> {
        console.log(`[Gemini-Subtitles] Processing audio for SRT: ${audioUrl}`);

        try {
            // 1. Download audio
            const response = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            const audioData = Buffer.from(response.data);
            const mimeType = this.getMimeType(audioUrl);

            // 2. Prompt Gemini for SRT
            const model = this.genAI.getGenerativeModel({ model: this.modelName });
            const prompt = "Transcribe this audio and format it as a standard SubRip (.srt) file. Ensure the timing is accurate and matches the speech. Return ONLY the content of the .srt file, no markdown, no comments.";

            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType,
                        data: audioData.toString('base64')
                    }
                },
                { text: prompt }
            ]);

            const srtContent = result.response.text().replace(/```srt\n?|```/g, '').trim();
            const jobId = this.extractJobId(audioUrl) || `sub_${Date.now()}`;
            const srtFilename = `subtitles_${jobId}.srt`;

            if (this.storageClient) {
                // Upload to Cloudinary (User says Cloudinary is free)
                const uploadResult = await this.storageClient.uploadRawContent(
                    srtContent,
                    srtFilename,
                    { folder: 'instagram-reels/subtitles' }
                );
                return {
                    subtitlesUrl: uploadResult.url,
                    srtContent,
                    format: 'srt',
                };
            } else {
                // Save locally as fallback
                const rendersDir = path.join(process.cwd(), 'public', 'renders');
                if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });
                const filePath = path.join(rendersDir, srtFilename);
                fs.writeFileSync(filePath, srtContent);

                return {
                    subtitlesUrl: `/renders/${srtFilename}`,
                    srtContent,
                    format: 'srt',
                };
            }
        } catch (error) {
            console.error('[Gemini-Subtitles] Generation failed:', error);
            throw new Error(`Gemini subtitle generation failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private extractJobId(url: string): string | null {
        const match = url.match(/voiceover_(job_[^.]+)/);
        return match ? match[1] : null;
    }

    private getMimeType(url: string): string {
        const ext = path.extname(url.split(/[?#]/)[0]).toLowerCase();
        const mimetypes: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4'
        };
        return mimetypes[ext] || 'audio/mpeg';
    }
}
