import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { ITranscriptionClient } from '../../domain/ports/ITranscriptionClient';

const execAsync = promisify(exec);

/**
 * OpenAI Whisper-based transcription client.
 * Uses the /v1/audio/transcriptions endpoint.
 * Now handles large files/videos by compressing with FFmpeg.
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
     * Downloads the file and uses FFmpeg to compress/extract audio if it's a video or > 25MB.
     */
    async transcribe(audioUrl: string): Promise<string> {
        if (!audioUrl) {
            throw new Error('Audio URL is required');
        }

        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'transcription-'));
        const extension = this.getExtensionFromUrl(audioUrl) || 'mp4';
        const inputPath = path.join(tempDir, `input.${extension}`);
        const outputPath = path.join(tempDir, 'processed.mp3');

        try {
            // 1. Download the file
            console.log(`[Whisper] Downloading source: ${audioUrl}`);
            const response = await axios({
                url: audioUrl,
                method: 'GET',
                responseType: 'stream',
            });

            const writer = fs.createWriteStream(inputPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const stats = fs.statSync(inputPath);
            console.log(`[Whisper] Downloaded ${(stats.size / 1024 / 1024).toFixed(1)}MB`);

            let uploadPath = inputPath;

            // 2. Determine if we need to process (Video or > 24MB)
            const isVideo = ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(extension);
            const isTooLarge = stats.size > 24.5 * 1024 * 1024;

            if (isVideo || isTooLarge) {
                console.log(`[Whisper] Processing file (isVideo=${isVideo}, size=${(stats.size / 1024 / 1024).toFixed(1)}MB)...`);

                // Try system ffmpeg (standard locations)
                const ffmpegPaths = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
                let ffmpegPath = 'ffmpeg'; // default

                // We'll just run 'ffmpeg' and hope it's in path, or use our verified path
                const cmd = `/opt/homebrew/bin/ffmpeg -i "${inputPath}" -vn -ar 16000 -ac 1 -b:a 64k "${outputPath}" -y`;

                console.log(`[Whisper] Running: ${cmd}`);
                await execAsync(cmd);

                uploadPath = outputPath;
                const newStats = fs.statSync(uploadPath);
                console.log(`[Whisper] Compressed to ${(newStats.size / 1024 / 1024).toFixed(1)}MB`);
            }

            // 3. Create form data
            const formData = new FormData();
            formData.append('file', fs.createReadStream(uploadPath));
            formData.append('model', 'whisper-1');
            formData.append('response_format', 'text');

            console.log(`[Whisper] Sending to OpenAI...`);
            const transcriptionResponse = await axios.post(
                `${this.baseUrl}/v1/audio/transcriptions`,
                formData,
                {
                    headers: {
                        ...formData.getHeaders(),
                        Authorization: `Bearer ${this.apiKey}`,
                    },
                    maxContentLength: Infinity,
                    maxBodyLength: Infinity,
                }
            );

            return transcriptionResponse.data.trim();
        } catch (error: any) {
            console.error('[Whisper] Error:', error.message);
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`Transcription failed: ${message}`);
            }
            throw error;
        } finally {
            // Cleanup temp files
            try {
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (e) {
                // Ignore cleanup errors
            }
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
