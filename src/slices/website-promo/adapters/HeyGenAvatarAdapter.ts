/**
 * HeyGen Avatar Adapter
 * 
 * Implements IAvatarGenerationPort using the HeyGen V2 API.
 * Supports generating talking avatar videos from text.
 */

import axios from 'axios';
import {
    IAvatarGenerationPort,
    AvatarConfig,
    AvatarVideoResult,
    AvailableAvatar
} from '../ports/IAvatarGenerationPort';

export class HeyGenAvatarAdapter implements IAvatarGenerationPort {
    private readonly baseUrl = 'https://api.heygen.com/v2';
    private readonly apiKey: string;

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    private get headers() {
        return {
            'X-Api-Key': this.apiKey,
            'Content-Type': 'application/json'
        };
    }

    async generateAvatarVideo(script: string, config: AvatarConfig, audioUrl?: string): Promise<AvatarVideoResult> {
        console.log(`[HeyGen] Starting video generation for avatar: ${config.avatarId}`);
        if (audioUrl) {
            console.log(`[HeyGen] Note: audioUrl provided (${audioUrl}), but using text-to-video for this adapter.`);
        }

        try {
            // 1. Submit video generation job
            const response = await axios.post(
                `${this.baseUrl}/video_generate`,
                {
                    video_inputs: [
                        {
                            character: {
                                type: 'avatar',
                                avatar_id: config.avatarId,
                                avatar_style: config.resolution === '4k' ? 'high' : 'normal'
                            },
                            voice: {
                                type: 'text',
                                input_text: script,
                                voice_id: config.voiceId || process.env.HEYGEN_VOICE_ID,
                                speed: 1.0
                            },
                            background: {
                                type: config.background === 'transparent' ? 'transparent' : 'color',
                                value: config.background === 'transparent' ? '' : '#ffffff'
                            }
                        }
                    ],
                    dimension: this.getDimension(config.resolution || '1080p')
                },
                { headers: this.headers }
            );

            const videoId = response.data.data?.video_id;
            if (!videoId) {
                throw new Error(`HeyGen failed to return video_id: ${JSON.stringify(response.data)}`);
            }

            console.log(`[HeyGen] Job submitted successfully. Video ID: ${videoId}. Polling for completion...`);

            // 2. Poll for completion
            const videoUrl = await this.pollForCompletion(videoId);

            return {
                videoUrl,
                durationSeconds: 0, // Duration is usually unknown until downloaded or meta-scraped
                renderId: videoId
            };
        } catch (error: any) {
            console.error('[HeyGen] Error generating video:', error.response?.data || error.message);
            throw new Error(`HeyGen video generation failed: ${error.message}`);
        }
    }

    async listAvatars(): Promise<AvailableAvatar[]> {
        try {
            const response = await axios.get(`${this.baseUrl}/avatars`, { headers: this.headers });
            const avatars = response.data.data?.avatars || [];

            return avatars.map((a: any) => ({
                id: a.avatar_id,
                name: a.avatar_name,
                gender: a.gender || 'neutral',
                style: 'professional', // Default style mapping
                previewUrl: a.preview_image_url || '',
                voiceId: '' // Voice ID is separate in HeyGen
            }));
        } catch (error: any) {
            console.error('[HeyGen] Error listing avatars:', error.message);
            return [];
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Simple check by listing avatars
            await this.listAvatars();
            return true;
        } catch {
            return false;
        }
    }

    private getDimension(resolution: string) {
        switch (resolution) {
            case '720p': return { width: 1280, height: 720 };
            case '4k': return { width: 3840, height: 2160 };
            default: return { width: 1920, height: 1080 };
        }
    }

    private async pollForCompletion(videoId: string): Promise<string> {
        const maxAttempts = 60; // 5 minutes max (5s intervals)
        const intervalMs = 5000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const response = await axios.get(`${this.baseUrl}/video_status?video_id=${videoId}`, {
                    headers: this.headers
                });

                const status = response.data.data?.status;
                console.log(`[HeyGen] Polling attempt ${attempt}: Status = ${status}`);

                if (status === 'completed') {
                    const videoUrl = response.data.data?.video_url;
                    if (!videoUrl) throw new Error('Status completed but video_url is missing');
                    return videoUrl;
                }

                if (status === 'failed') {
                    throw new Error(`HeyGen video generation failed: ${response.data.data?.error?.message || 'Unknown error'}`);
                }

                // Wait before next poll
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            } catch (error: any) {
                if (attempt === maxAttempts) throw error;
                console.warn(`[HeyGen] Warning during status check: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, intervalMs));
            }
        }

        throw new Error('HeyGen video generation timed out after 5 minutes');
    }
}
