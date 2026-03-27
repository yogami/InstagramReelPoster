import axios from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { ITtsClient, TTSResult, TTSOptions } from '../../domain/ports/ITtsClient';

/**
 * Google Cloud Text-to-Speech client.
 * Provides high-quality voice synthesis with a generous free tier (Standard/WaveNet).
 * Part of the "Google Ultra" cost-optimization strategy.
 */
export class GoogleTtsClient implements ITtsClient {
    private readonly apiKey: string;
    private readonly voiceName: string;
    private readonly languageCode: string;

    constructor(
        apiKey: string,
        voiceName: string = 'en-US-Neural2-J', // High-quality Neural2 voice
        languageCode: string = 'en-US'
    ) {
        if (!apiKey) {
            throw new Error('Google API key is required for TTS');
        }
        this.apiKey = apiKey;
        this.voiceName = voiceName;
        this.languageCode = languageCode;
    }

    async synthesize(text: string, options?: TTSOptions): Promise<TTSResult> {
        if (!text || !text.trim()) {
            throw new Error('Text is required for TTS');
        }

        try {
            console.log(`[Google TTS] Synthesizing with ${this.voiceName}...`);

            const response = await axios.post(
                `https://texttospeech.googleapis.com/v1/text:synthesize?key=${this.apiKey}`,
                {
                    input: { text: text.trim() },
                    voice: {
                        languageCode: this.languageCode,
                        name: this.voiceName,
                    },
                    audioConfig: {
                        audioEncoding: 'MP3',
                        speakingRate: options?.speed || 1.0,
                    },
                },
                {
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            const audioContent = response.data.audioContent;
            const audioUrl = `data:audio/mp3;base64,${audioContent}`;

            // Get actual duration by probing the MP3 with ffprobe
            const durationSeconds = this.probeAudioDuration(audioContent);

            return {
                audioUrl,
                durationSeconds,
            };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`Google TTS failed: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Probes actual MP3 duration using ffprobe.
     * Writes base64 audio to temp file, probes, then cleans up.
     */
    private probeAudioDuration(base64Audio: string): number {
        const tmpFile = path.join(os.tmpdir(), `tts_probe_${Date.now()}.mp3`);
        try {
            fs.writeFileSync(tmpFile, Buffer.from(base64Audio, 'base64'));
            const result = execSync(
                `ffprobe -v error -show_entries format=duration -of csv=p=0 "${tmpFile}"`,
                { encoding: 'utf-8', timeout: 5000 }
            ).trim();
            const duration = parseFloat(result);
            if (isNaN(duration) || duration <= 0) {
                console.warn(`[Google TTS] ffprobe returned invalid duration: ${result}, falling back to estimate`);
                return 2.0; // safe fallback
            }
            return duration;
        } catch (err) {
            console.warn(`[Google TTS] ffprobe failed, using 2s fallback:`, err);
            return 2.0;
        } finally {
            try { fs.unlinkSync(tmpFile); } catch { /* ignore cleanup errors */ }
        }
    }
}
