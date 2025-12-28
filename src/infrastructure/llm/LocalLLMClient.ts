import axios from 'axios';
import {
    ILlmClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
} from '../../domain/ports/ILlmClient';
import { HookPlan, CaptionAndTags } from '../../domain/entities/Growth';
import { getConfig } from '../../config';

/**
 * Local LLM Client for Ollama-compatible servers.
 */
export class LocalLlmClient implements ILlmClient {
    private readonly serverUrl: string;
    private readonly model: string;
    private readonly systemPrompt: string;

    constructor(serverUrl: string, model: string = 'llama3.2', systemPrompt?: string) {
        if (!serverUrl) {
            throw new Error('Local LLM server URL is required');
        }
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.model = model;
        this.systemPrompt = systemPrompt || 'You are a helpful and intelligent personal AI twin.';
    }

    async detectReelMode(transcript: string): Promise<ReelModeDetectionResult> {
        if (!transcript || transcript.trim().length === 0) {
            return {
                isAnimatedMode: false,
                reason: 'Empty transcript defaults to image-based reel',
            };
        }

        const prompt = `Analyze this transcript. Does the user want an ANIMATED VIDEO (moving visuals) or standard IMAGES?

Transcript: "${transcript}"

Rules:
1. isAnimatedMode = true ONLY if they say "animated", "animation", "video", "motion", "moving visuals".
2. Default is false.

Respond ONLY with JSON:
{
  "isAnimatedMode": boolean,
  "storyline": "optional string if they describe a specific animation story",
  "reason": "short explanation"
}`;

        try {
            const response = await this.callOllama(prompt);
            const parsed = this.parseJSON<ReelModeDetectionResult>(response);

            return {
                isAnimatedMode: parsed.isAnimatedMode ?? false,
                storyline: parsed.storyline,
                reason: parsed.reason ?? 'Detection completed',
            };
        } catch (error) {
            console.warn('[LocalLLM] Reel mode detection failed, defaulting to image mode:', error);
            return {
                isAnimatedMode: false,
                reason: 'Detection failed, defaulting to image-based reel',
            };
        }
    }

    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        const prompt = `Plan a short-form video reel from this voice note.

Transcript:
"""
${transcript}
"""

Constraints:
- Duration must be between ${constraints.minDurationSeconds} and ${constraints.maxDurationSeconds} seconds
- Target ~5 seconds per segment.

Respond with a JSON object:
{
  "targetDurationSeconds": <number>,
  "segmentCount": <number>,
  "musicTags": ["array"],
  "musicPrompt": "string",
  "mood": "string",
  "summary": "string",
  "mainCaption": "string"
}`;

        const response = await this.callOllama(prompt);
        const plan = this.parseJSON<ReelPlan>(response);

        if (plan.segmentCount < 2) plan.segmentCount = 2;
        if (plan.segmentCount > 15) plan.segmentCount = 15;

        return plan;
    }

    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        const config = getConfig();
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        const wordsPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps);

        const prompt = `Create EXACTLY ${plan.segmentCount} segments for this reel.
Transcript: "${transcript}"
Concept: ${plan.summary}

Respond with a JSON object with "segments" array:
{
  "segments": [
    { "commentary": "...", "imagePrompt": "...", "caption": "..." }
  ]
}`;

        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<any>(response);
        return this.normalizeSegments(parsed);
    }

    async adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]> {
        const prompt = `Adjust these segment commentaries to be ${direction}: ${JSON.stringify(segments)}`;
        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<any>(response);
        return this.normalizeSegments(parsed);
    }

    async generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]> {
        const trendNote = trendContext ? ` Current trend: "${trendContext}"` : '';
        const prompt = `Generate 5 viral hooks for this transcript: "${transcript}".${trendNote}
Respond ONLY with JSON: { "hooks": ["hook1", "hook2", ...] }`;

        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<{ hooks: string[] }>(response);
        return parsed.hooks || [];
    }

    async generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags> {
        const prompt = `Write a viral Instagram caption and 10 hashtags for this script: "${fullScript}"
Respond ONLY with JSON: { "captionBody": "...", "hashtags": ["#tag1", ...] }`;

        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<any>(response);

        let hashtags: string[] = [];
        if (Array.isArray(parsed.hashtags)) {
            hashtags = parsed.hashtags;
        } else if (typeof parsed.hashtags === 'string') {
            // Handle space-separated or comma-separated string
            hashtags = (parsed.hashtags as string).split(/[\s,]+/).filter(t => t.length > 0);
        }

        // Ensure every tag has a # and is cleaned
        hashtags = hashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`).filter((t: string) => t !== '#');

        // Ensure hashtags is at least an empty array to prevent undefined errors
        if (hashtags.length === 0) {
            console.warn('[LocalLLM] generateCaptionAndTags returned no hashtags, providing defaults');
            hashtags = [
                '#ChallengingView',
                '#spirituality',
                '#reels',
                '#growth',
                '#selfawareness',
                '#mentalhealth',
                '#selfinquiry',
                '#shadowwork',
                '#psychology',
                '#mindset'
            ];
        }

        return {
            captionBody: parsed.captionBody || 'New reel ready!',
            hashtags
        };
    }

    private async callOllama(prompt: string): Promise<string> {
        const maxRetries = 3;
        let lastError: any;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await axios.post(
                    `${this.serverUrl}/api/generate`,
                    {
                        model: this.model,
                        prompt: prompt,
                        system: this.systemPrompt,
                        stream: false,
                        format: 'json',
                        options: { temperature: 0.7 },
                    },
                    {
                        headers: { 'Content-Type': 'application/json' },
                        timeout: 180000,
                    }
                );

                return response.data.response;
            } catch (error: any) {
                lastError = error;
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    // Retry on transient errors (502, 503, 429)
                    if ((status === 429 || status === 502 || status === 503) && attempt < maxRetries - 1) {
                        const baseDelay = Math.pow(2, attempt + 1) * 1000;
                        const jitter = Math.floor(Math.random() * 1000);
                        const delay = baseDelay + jitter;

                        console.warn(`[LocalLLM] Transient error (${status}), retrying in ${delay / 1000}s (Attempt ${attempt + 1}/${maxRetries})...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }
                }
                break; // Non-retryable or max retries reached
            }
        }

        if (axios.isAxiosError(lastError)) {
            const status = lastError.response?.status;
            const message = lastError.response?.data?.error || lastError.message;
            throw new Error(`Local LLM call failed (${status}): ${message}`);
        }
        throw lastError;
    }

    private normalizeSegments(data: any): SegmentContent[] {
        if (!data) throw new Error('LLM returned null');
        if (Array.isArray(data)) return data;
        if (data.segments && Array.isArray(data.segments)) return data.segments;
        if (data.commentary && data.imagePrompt) return [data];
        throw new Error('Invalid segments format');
    }

    private parseJSON<T>(response: string): T {
        try {
            const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch {
            throw new Error(`Failed to parse JSON: ${response.substring(0, 100)}`);
        }
    }

    /**
     * Checks if the Ollama server is available.
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await axios.get(`${this.serverUrl}/api/tags`, { timeout: 5000 });
            return response.status === 200;
        } catch {
            return false;
        }
    }
}
