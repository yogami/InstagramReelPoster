import axios from 'axios';
import {
    IAvatarGenerationPort,
    AvatarConfig,
    AvatarVideoResult,
    AvailableAvatar
} from '../ports/IAvatarGenerationPort';

/**
 * SadTalker Avatar Adapter (via Beam.cloud)
 * 
 * Implements IAvatarGenerationPort using an open-source SadTalker instance 
 * hosted on Beam.cloud. This addresses the "GPU Offloading" and "Pre-rendering"
 * strategies by using localized, cost-effective inference.
 */
export class SadTalkerAvatarAdapter implements IAvatarGenerationPort {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeout: number;

    constructor(
        apiKey: string,
        endpointUrl: string,
        timeout: number = 300000 // 5 minutes
    ) {
        this.apiKey = apiKey;
        this.endpointUrl = endpointUrl;
        this.timeout = timeout;
    }

    async generateAvatarVideo(script: string, config: AvatarConfig, audioUrl?: string): Promise<AvatarVideoResult> {
        console.log(`[SadTalker] Generating lipsync video for avatar: ${config.avatarId}`);

        // Priority for the "Pre-render + Lip Sync" strategy:
        // Use pre-generated high-quality audio (Fish Audio) and pre-rendered base video.
        const sourceImage = config.backgroundUrl || 'https://raw.githubusercontent.com/Winfredy/SadTalker/main/examples/source_image/full_body_1.png';

        try {
            const startTime = Date.now();

            // Beam.cloud endpoint expectation for SadTalker:
            // - source_image or driven_video (for pre-rendered)
            // - driven_audio (our audioUrl)
            // - preprocess: 'full' (to handle head movements)
            const response = await axios.post(
                this.endpointUrl,
                {
                    source_image: sourceImage,
                    driven_audio: audioUrl, // Use the pre-generated voiceover
                    preprocess: 'full',
                    still: true, // Keep it relatively stable to avoid artifacts
                    use_enhancer: true, // Better quality for "Pro" engine
                    pre_rendered_video: config.preRenderedBaseUrl // Optimization hook
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: this.timeout,
                }
            );

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`[SadTalker] Video generated in ${elapsed}s`);

            const videoUrl = this.extractVideoUrl(response.data);

            return {
                videoUrl,
                durationSeconds: 0, // Should be matched to audio duration by the orchestrator
                renderId: `sadtalker-${Date.now()}`
            };
        } catch (error: any) {
            console.error(`[SadTalker] Generation failed:`, error.response?.data || error.message);
            throw new Error(`SadTalker generation failed: ${error.message}`);
        }
    }

    private extractVideoUrl(data: any): string {
        if (data?.video_url) return data.video_url;
        if (data?.output) return data.output;
        if (data?.url) return data.url;
        throw new Error(`Could not extract video URL from SadTalker response: ${JSON.stringify(data)}`);
    }

    async listAvatars(): Promise<AvailableAvatar[]> {
        // Local SadTalker doesn't "list" avatars like HeyGen, but we can return
        // the pre-defined ones we have in our CDN/Assets.
        return [];
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Verify endpoint is reachable
            await axios.get(this.endpointUrl, {
                headers: { 'Authorization': `Bearer ${this.apiKey}` },
                timeout: 5000
            });
            return true;
        } catch {
            return false;
        }
    }
}
