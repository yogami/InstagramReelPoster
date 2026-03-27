import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ITranscriptionClient } from '../../domain/ports/ITranscriptionClient';

/**
 * Transcription client using Google's Gemini models.
 * Gemini 1.5 Pro/Flash can process audio files directly and return text.
 * This eliminates the need for external Whisper API subscriptions.
 */
export class GeminiTranscriptionClient implements ITranscriptionClient {
    private readonly genAI: GoogleGenerativeAI;
    private readonly modelName: string;

    constructor(apiKey: string, modelName: string = 'gemini-1.5-flash') {
        if (!apiKey) {
            throw new Error('Google API key is required for Gemini transcription');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName;
    }

    /**
     * Transcribes audio/video from a URL by sending it to Gemini.
     */
    async transcribe(audioUrl: string): Promise<string> {
        console.log(`[Gemini-STT] Downloading media for transcription: ${audioUrl}`);

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gemini-stt-'));
        const fileName = this.getFileName(audioUrl);
        const filePath = path.join(tempDir, fileName);

        try {
            // 1. Download source file
            const response = await axios({
                url: audioUrl,
                method: 'GET',
                responseType: 'arraybuffer',
                timeout: 60000,
            });
            fs.writeFileSync(filePath, Buffer.from(response.data));

            // 2. Determine MIME type
            const mimeType = this.getMimeType(fileName);

            // 3. Prepare Gemini request
            const model = this.genAI.getGenerativeModel({ model: this.modelName });

            const prompt = "Please transcribe this audio accurately. If it is a video, only transcribe the spoken words. Return ONLY the transcription text.";

            const result = await model.generateContent([
                {
                    inlineData: {
                        mimeType,
                        data: Buffer.from(response.data).toString('base64')
                    }
                },
                { text: prompt }
            ]);

            const transcription = result.response.text();
            console.log(`[Gemini-STT] Transcription complete (${transcription.length} characters)`);

            return transcription.trim();

        } catch (error) {
            console.error('[Gemini-STT] Transcription failed:', error);
            throw new Error(`Gemini transcription failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Cleanup cleanup
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (e) {
                // Ignore cleanup errors
            }
        }
    }

    private getFileName(url: string): string {
        const match = url.match(/\/([^\/?#]+)(?:\?|$)/);
        return match ? match[1] : 'media.mp4';
    }

    private getMimeType(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        const mimetypes: Record<string, string> = {
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.ogg': 'audio/ogg',
            '.m4a': 'audio/mp4',
            '.mp4': 'video/mp4',
            '.mov': 'video/quicktime',
            '.webm': 'video/webm',
            '.mpeg': 'video/mpeg'
        };
        return mimetypes[ext] || 'video/mp4';
    }
}
