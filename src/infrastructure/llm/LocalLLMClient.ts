import axios from 'axios';
import {
    ILLMClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
} from '../../domain/ports/ILLMClient';
import { getConfig } from '../../config';

// Character/Personality prompt is now passed via constructor from configuration


/**
 * Local LLM Client for Ollama-compatible servers.
 * 
 * Implements the same ILLMClient interface as OpenAILLMClient but uses
 * a locally running LLM (e.g., Ollama with a fine-tuned personality model).
 * 
 * This allows using a custom-trained model that captures the user's
 * writing style, thought patterns, and personality.
 * 
 * @see https://github.com/ollama/ollama
 */
export class LocalLLMClient implements ILLMClient {
    private readonly serverUrl: string;
    private readonly model: string;
    private readonly systemPrompt: string;

    /**
     * Creates a Local LLM client.
     * @param serverUrl URL of the Ollama server (e.g., http://localhost:11434)
     * @param model Model name to use
     * @param systemPrompt The character/personality prompt for the twin
     */
    constructor(serverUrl: string, model: string = 'llama3.2', systemPrompt?: string) {
        if (!serverUrl) {
            throw new Error('Local LLM server URL is required');
        }
        this.serverUrl = serverUrl.replace(/\/$/, '');
        this.model = model;
        this.systemPrompt = systemPrompt || 'You are a helpful and intelligent personal AI twin.';
    }

    /**
     * Detects whether the user wants an animated video reel based on their transcript.
     * Uses generic intent detection prompt for likely less capable local models.
     */
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

            console.log(`[LocalLLM] Reel mode detection: ${parsed.isAnimatedMode ? 'ANIMATED' : 'IMAGES'} - ${parsed.reason}`);

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

    /**
     * Plans the structure of a reel based on the transcript.
     * SEGMENT COUNT is calculated mathematically, NOT by LLM.
     */
    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        const prompt = `Plan a short-form video reel from this voice note.

Transcript:
"""
${transcript}
"""

Constraints:
- Duration must be between ${constraints.minDurationSeconds} and ${constraints.maxDurationSeconds} seconds
- Target ~5 seconds per segment.
- If the transcript explicitly requests a duration (e.g. "1 minute"), HONOR IT.
- If no duration is requested, choose a duration fitting the content depth.

Respond with a JSON object containing:
{
  "targetDurationSeconds": <number>,
  "segmentCount": <number: duration / 5>,
  "musicTags": ["array", "of", "music", "search", "tags"],
  "musicPrompt": "description for AI music generation",
  "mood": "overall mood/tone",
  "summary": "brief summary of the reel concept"
}

CRITICAL: segmentCount must be an Integer between 2 and 15.
RESPOND ONLY WITH VALID JSON, NO OTHER TEXT.`;

        const response = await this.callOllama(prompt);
        const plan = this.parseJSON<ReelPlan>(response);

        // Safety CLAMP on segment count
        if (plan.segmentCount < 2) plan.segmentCount = 2;
        if (plan.segmentCount > 15) plan.segmentCount = 15;

        console.log(`[LocalLLM] Planned ${plan.targetDurationSeconds}s with ${plan.segmentCount} segments.`);

        return plan;
    }

    /**
     * Generates commentary and image prompts for each segment.
     */
    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        const config = getConfig();
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        const wordsPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps);

        const prompt = `Create EXACTLY ${plan.segmentCount} segments for this reel.

Original transcript:
"""
${transcript}
"""

Reel concept: ${plan.summary}
Mood: ${plan.mood}
Target: ~${wordsPerSegment} words per segment (${secondsPerSegment.toFixed(1)}s each)

CRITICAL REQUIREMENTS:
1. Return a JSON object with "segments" key containing an array
2. The array must have EXACTLY ${plan.segmentCount} objects
3. Maintain the personality and voice style defined in your system prompt.

Each segment MUST have these fields:
{
  "commentary": "1-2 sentences (~${wordsPerSegment} words) - the MESSAGE, not visual description",
  "imagePrompt": "100-140 word detailed visual description for image generation",
  "caption": "optional short subtitle"
}

RESPOND ONLY WITH VALID JSON in this format:
{
  "segments": [
    { "commentary": "...", "imagePrompt": "...", "caption": "..." },
    ...
  ]
}`;

        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<any>(response);

        return this.normalizeSegments(parsed);
    }

    /**
     * Adjusts commentary length to better match target duration.
     */
    async adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]> {
        const config = getConfig();
        const secondsPerSegment = targetDurationSeconds / segments.length;
        const wordsPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps);

        const prompt = `Adjust these segment commentaries to be ${direction}.

Current segments (Count: ${segments.length}):
${JSON.stringify(segments, null, 2)}

Target Duration: ${targetDurationSeconds}s total.
Target Word Budget: ~${wordsPerSegment} words per segment.

Rules:
1. You MUST return EXACTLY ${segments.length} segment objects. Do NOT truncate or merge them.
2. Make each commentary ${direction === 'shorter' ? 'more concise' : 'slightly more developed'} to hit the target budget.
3. Keep the same meaning and impact
4. Maintain the character and voice style defined in your system prompt
5. Keep image prompts and captions unchanged

RESPOND ONLY WITH VALID JSON in this format:
{
  "segments": [adjusted segment objects]
}`;

        const response = await this.callOllama(prompt);
        const parsed = this.parseJSON<any>(response);

        return this.normalizeSegments(parsed);
    }

    /**
     * Calls the Ollama API.
     */
    private async callOllama(prompt: string): Promise<string> {
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[LocalLLM] Calling ${this.serverUrl} with model ${this.model}`);

                const response = await axios.post(
                    `${this.serverUrl}/api/generate`,
                    {
                        model: this.model,
                        prompt: prompt,
                        system: this.systemPrompt,
                        stream: false,
                        format: 'json',
                        options: {
                            temperature: 0.7,
                        },
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        timeout: 180000, // 3 minutes for local LLM which can be slow
                    }
                );

                return response.data.response;
            } catch (error) {
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    const message = error.response?.data?.error || error.message;

                    // Retry on transient errors
                    if ((status === 502 || status === 503 || status === 429) && attempt < maxRetries - 1) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`[LocalLLM] Transient error (${status}), retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error(`Local LLM call failed: ${message}`);
                }
                throw error;
            }
        }

        throw new Error('Local LLM call failed after max retries');
    }

    /**
     * Normalizes segment content to ensure it's always an array of SegmentContent.
     * Same logic as OpenAILLMClient for consistency.
     */
    private normalizeSegments(data: any): SegmentContent[] {
        if (data === null || data === undefined) {
            throw new Error('LLM returned null or undefined segment content');
        }

        if (Array.isArray(data)) {
            console.log(`[LocalLLM] normalizeSegments: received array with ${data.length} items`);
            return data;
        }

        console.log(`[LocalLLM] normalizeSegments: received ${typeof data}, attempting normalization`);

        if (data && typeof data === 'object' && Array.isArray(data.segments)) {
            console.log(`[LocalLLM] normalizeSegments: unwrapped .segments with ${data.segments.length} items`);
            return data.segments;
        }

        if (data && typeof data === 'object' && data.commentary && data.imagePrompt) {
            console.log(`[LocalLLM] normalizeSegments: wrapped single object`);
            return [data as SegmentContent];
        }

        if (data && typeof data === 'object') {
            const values = Object.values(data);
            if (values.length > 0 && typeof values[0] === 'object' && (values[0] as any).commentary) {
                console.log(`[LocalLLM] normalizeSegments: extracted ${values.length} items from object values`);
                return values as SegmentContent[];
            }
        }

        throw new Error(`LLM returned invalid segments format: ${JSON.stringify(data).substring(0, 200)}`);
    }

    /**
     * Parses JSON from LLM response.
     */
    private parseJSON<T>(response: string): T {
        try {
            // Handle potential markdown code blocks
            const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch {
            throw new Error(`Failed to parse LLM response as JSON: ${response.substring(0, 200)}...`);
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
