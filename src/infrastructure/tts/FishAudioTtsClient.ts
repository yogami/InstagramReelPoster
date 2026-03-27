import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { ITtsClient, TTSResult, TTSOptions } from '../../domain/ports/ITtsClient';

/**
 * Fish Audio TTS Client — expressive, emotionally rich text-to-speech.
 *
 * Free tier: 20 gens/day, 40K chars/month.
 * Supports 64+ inline emotion markers like (angry), (sad), (whispering).
 *
 * API: POST https://api.fish.audio/v1/tts
 */
export class FishAudioTtsClient implements ITtsClient {
    private readonly apiKey: string;
    private readonly referenceId: string;

    constructor(
        apiKey: string,
        referenceId: string, // Voice model ID from Fish Audio library
    ) {
        if (!apiKey) {
            throw new Error('Fish Audio API key is required');
        }
        this.apiKey = apiKey;
        this.referenceId = referenceId;
    }

    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            console.log(`[Fish Audio] Synthesizing with voice ${this.referenceId.substring(0, 8)}...`);

            const response = await axios.post(
                'https://api.fish.audio/v1/tts',
                {
                    text: text.trim(),
                    reference_id: options?.voiceId || this.referenceId,
                    format: 'mp3',
                    model: 's1',
                    latency: 'normal',
                    ...(options?.speed && { speed: options.speed }),
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    responseType: 'arraybuffer',
                    timeout: 30_000,
                }
            );

            // Fish Audio returns raw audio bytes
            const audioBuffer = Buffer.from(response.data);
            const base64Audio = audioBuffer.toString('base64');
            const audioUrl = `data:audio/mp3;base64,${base64Audio}`;

            // Get actual duration via ffprobe
            const durationSeconds = this.probeAudioDuration(audioBuffer);

            return {
                audioUrl,
                durationSeconds,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const status = error.response?.status;
                const message = error.response?.data
                    ? Buffer.from(error.response.data).toString('utf-8').substring(0, 200)
                    : error.message;
                throw new Error(`Fish Audio TTS failed (${status}): ${message}`);
            }
            throw error;
        }
    }

    /**
     * Probes actual MP3 duration using ffprobe.
     */
    private probeAudioDuration(audioBuffer: Buffer): number {
        const tmpFile = path.join(os.tmpdir(), `fish_probe_${Date.now()}.mp3`);
        try {
            fs.writeFileSync(tmpFile, audioBuffer);
            const result = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${tmpFile}"`,
                { encoding: 'utf-8', timeout: 5000 }
            ).trim();
            const duration = parseFloat(result);
            if (isNaN(duration) || duration <= 0) {
                console.warn(`[Fish Audio] ffprobe returned invalid duration: ${result}`);
                return 2.0;
            }
            return duration;
        } catch (err) {
            console.warn(`[Fish Audio] ffprobe failed, using 2s fallback:`, err);
            return 2.0;
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        }
    }
}
