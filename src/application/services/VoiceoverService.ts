import { ITTSClient } from '../../domain/ports/ITTSClient';
import { CloudinaryStorageClient } from '../../infrastructure/storage/CloudinaryStorageClient';
import { calculateSpeedAdjustment } from '../../domain/services/DurationCalculator';

/**
 * VoiceoverService handles TTS synthesis with fallback and speed adjustment.
 * Extracted from ReelOrchestrator to reduce complexity and improve testability.
 */
export class VoiceoverService {
    constructor(
        private readonly primaryTTS: ITTSClient,
        private readonly fallbackTTS?: ITTSClient,
        private readonly storageClient?: CloudinaryStorageClient
    ) { }

    /**
     * Synthesizes voiceover with optional speed adjustment.
     * Falls back to secondary TTS client if primary fails.
     */
    async synthesize(
        text: string,
        targetDuration: number,
        voiceId?: string
    ): Promise<{ voiceoverUrl: string; voiceoverDuration: number; speed: number }> {
        let result: { audioUrl: string; durationSeconds: number };
        let speed = 1.0;

        // First pass at normal speed
        try {
            console.log(`[TTS] Attempting synthesis with primary client...${voiceId ? ` (Voice: ${voiceId})` : ''}`);
            result = await this.primaryTTS.synthesize(text, { voiceId });
        } catch (error) {
            console.error('[TTS] ❌ Primary TTS failed. Falling back.');
            if (!this.fallbackTTS) {
                throw error;
            }
            console.warn('[TTS] ⚠️ Using fallback TTS client...');
            result = await this.fallbackTTS.synthesize(text, { voiceId });
        }

        // Apply speed adjustment if needed
        result = await this.applySpeedAdjustment(result, text, targetDuration, voiceId, speed);
        speed = result.durationSeconds !== targetDuration
            ? calculateSpeedAdjustment(result.durationSeconds, targetDuration)
            : 1.0;

        // Upload to Cloudinary if result is a data URL
        const voiceoverUrl = await this.uploadIfDataUrl(result.audioUrl);

        return {
            voiceoverUrl,
            voiceoverDuration: result.durationSeconds,
            speed,
        };
    }

    private async applySpeedAdjustment(
        result: { audioUrl: string; durationSeconds: number },
        text: string,
        targetDuration: number,
        voiceId?: string,
        currentSpeed: number = 1.0
    ): Promise<{ audioUrl: string; durationSeconds: number }> {
        const deviation = (result.durationSeconds - targetDuration) / targetDuration;
        const absDiff = Math.abs(result.durationSeconds - targetDuration);

        // Adjust if too long, too short (<95%), or more than 0.5s off for short reels
        if (deviation > 0 || deviation < -0.05 || absDiff > 0.5) {
            const speed = calculateSpeedAdjustment(result.durationSeconds, targetDuration);
            if (speed !== 1.0) {
                try {
                    console.log(`[TTS] Applying speed adjustment (${speed.toFixed(2)}x)...`);
                    return await this.primaryTTS.synthesize(text, { speed, pitch: 0.9, voiceId });
                } catch (error) {
                    console.warn('[TTS] ⚠️ Primary TTS speed adjustment failed');
                    if (this.fallbackTTS) {
                        console.log('[TTS] Trying fallback client for speed adjustment...');
                        return await this.fallbackTTS.synthesize(text, { speed, pitch: 0.9 });
                    }
                }
            }
        }
        return result;
    }

    private async uploadIfDataUrl(audioUrl: string): Promise<string> {
        if (audioUrl.startsWith('data:') && this.storageClient) {
            console.log('[Voiceover] Uploading base64 audio to Cloudinary...');
            try {
                const uploadResult = await this.storageClient.uploadAudio(audioUrl, {
                    folder: 'instagram-reels/voiceovers',
                    publicId: `voiceover_${Date.now()}`
                });
                console.log('[Voiceover] Uploaded successfully:', uploadResult.url);
                return uploadResult.url;
            } catch (uploadError) {
                console.error('[Voiceover] Cloudinary upload failed:', uploadError);
            }
        }
        return audioUrl;
    }
}
