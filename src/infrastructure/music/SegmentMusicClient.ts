import axios from 'axios';
import {
    IMusicGeneratorClient,
    MusicGenerationRequest,
} from '../../domain/ports/IMusicGeneratorClient';
import { Track, createTrack } from '../../domain/entities/Track';
import { v4 as uuidv4 } from 'uuid';

/**
 * VideoGen music generation client that wraps the Suno API.
 */
export class SegmentMusicClient implements IMusicGeneratorClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly pollIntervalMs: number;
    private readonly maxPollAttempts: number;

    constructor(
        apiKey: string,
        baseUrl: string = 'https://api.kie.ai/suno',
        pollIntervalMs: number = 5000,
        maxPollAttempts: number = 60
    ) {
        if (!apiKey) {
            throw new Error('VideoGen API key is required');
        }
        this.apiKey = apiKey;
        this.baseUrl = baseUrl;
        this.pollIntervalMs = pollIntervalMs;
        this.maxPollAttempts = maxPollAttempts;
    }

    /**
     * Generates music based on the request parameters.
     * Polls until completion or timeout.
     */
    async generateMusic(request: MusicGenerationRequest): Promise<Track> {
        const jobId = await this.startGeneration(request);
        const result = await this.pollForCompletion(jobId);

        return createTrack({
            id: `${jobId}`,
            title: `AI Generated - ${request.descriptionPrompt.substring(0, 50)}`,
            tags: this.extractTagsFromPrompt(request.descriptionPrompt),
            durationSeconds: request.durationSeconds,
            audioUrl: result.audioUrl,
            isAIGenerated: true,
        });
    }

    /**
     * Starts a music generation job.
     */
    private async startGeneration(request: MusicGenerationRequest): Promise<string> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/generate-music`,
                {
                    gpt_description_prompt: this.buildDescriptionPrompt(request.descriptionPrompt),
                    instrumental: request.instrumental ?? true,
                    duration: request.durationSeconds,
                    customMode: false,
                    model: 'V4_5',
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            const jobId = response.data.id || response.data.jobId;
            if (!jobId) {
                throw new Error('No job ID returned from VideoGen');
            }

            return jobId;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message ||
                    error.response?.data?.message ||
                    error.message;
                throw new Error(`Music generation failed to start: ${message}`);
            }
            throw error;
        }
    }

    /**
     * Polls for generation completion.
     */
    private async pollForCompletion(jobId: string): Promise<{ audioUrl: string }> {
        for (let attempt = 0; attempt < this.maxPollAttempts; attempt++) {
            try {
                const response = await axios.get(
                    `${this.baseUrl}/status/${jobId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                    }
                );

                const status = response.data.status;

                if (status === 'completed' || status === 'success') {
                    const audioUrl = response.data.audio_url || response.data.audioUrl;
                    if (!audioUrl) {
                        throw new Error('No audio URL in completed response');
                    }
                    return { audioUrl };
                }

                if (status === 'failed' || status === 'error') {
                    throw new Error(`Music generation failed: ${response.data.error || 'Unknown error'}`);
                }

                // Still processing, wait and retry
                await this.sleep(this.pollIntervalMs);
            } catch (error) {
                if (axios.isAxiosError(error) && error.response?.status !== 404) {
                    throw error;
                }
                // 404 might mean still processing, continue polling
                await this.sleep(this.pollIntervalMs);
            }
        }

        throw new Error(`Music generation timed out after ${this.maxPollAttempts * this.pollIntervalMs / 1000}s`);
    }

    /**
     * Builds a strict description prompt for ambient/eastern music.
     */
    private buildDescriptionPrompt(userPrompt: string): string {
        const base = `Create ambient, atmospheric music. Style: ${userPrompt}. 
Requirements:
- Ambient / drone / soundscape texture
- Eastern instruments ONLY (Flute, Sitar, Tanpura, Meditation Bells)
- ABSOLUTELY NO Bhangra, NO high-energy drums, NO party vibes
- Very low or no percussion
- Avoid piano and heavy Western harmony
- Meditation-friendly, subtle, and deeply calming`;

        return base;
    }

    /**
     * Extracts tags from the description prompt.
     */
    private extractTagsFromPrompt(prompt: string): string[] {
        const commonTags = [
            'ambient', 'meditation', 'spiritual', 'eastern', 'indian', 'flute',
            'bells', 'bowls', 'drone', 'atmospheric', 'peaceful', 'calm',
            'japanese', 'chinese', 'tibetan', 'zen', 'psychedelic'
        ];

        const promptLower = prompt.toLowerCase();
        const matched = commonTags.filter(tag => promptLower.includes(tag));

        // Always add ai-generated tag
        matched.push('ai-generated');

        return matched.length > 0 ? matched : ['ambient', 'ai-generated'];
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
