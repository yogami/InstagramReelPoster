import axios from 'axios';
import {
    ILLMClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
} from '../../domain/ports/ILLMClient';

/**
 * System prompt enforcing the "Challenging View" voice.
 */
const CHALLENGING_VIEW_SYSTEM_PROMPT = `You are the voice of "Challenging View" - a channel at the intersection of spirituality, philosophy, science, and psychology.

Your voice and style:
- Spiritually grounded, but questioning and sharp
- Uses psychological and scientific framing when useful
- Comfortable challenging comforting illusions and pointing out self-deception
- Uses metaphors, occasional sarcasm, and strong, direct statements
- No fluffy "Bay Area PC wellness" clichés
- Occasional invectives are allowed, but only when they serve meaning; avoid constant swearing
- Sentences must be easy to follow in audio; avoid dense academic language

When writing commentary:
- Be emotionally charged but grounded
- Speak as if directly to the listener, not lecturing
- Each sentence should hit with impact
- Balance provocation with genuine insight`;

/**
 * OpenAI GPT-based LLM client for reel planning and content generation.
 */
export class OpenAILLMClient implements ILLMClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;

    constructor(
        apiKey: string,
        model: string = 'gpt-4.1',
        baseUrl: string = 'https://api.openai.com'
    ) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    /**
     * Plans the structure of a reel based on the transcript.
     */
    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        const prompt = `Based on this voice note transcript, plan a short-form video reel.

Transcript:
"""
${transcript}
"""

Constraints:
- Duration must be between ${constraints.minDurationSeconds} and ${constraints.maxDurationSeconds} seconds
${constraints.moodOverrides?.length ? `- Mood should incorporate: ${constraints.moodOverrides.join(', ')}` : ''}

Respond with a JSON object containing:
{
  "targetDurationSeconds": <number between ${constraints.minDurationSeconds}-${constraints.maxDurationSeconds}>,
  "segmentCount": <number of story beats, typically 3-6>,
  "musicTags": ["array", "of", "music", "search", "tags"],
  "musicPrompt": "description for AI music generation if needed",
  "mood": "overall mood/tone",
  "summary": "brief summary of the reel concept"
}

Choose duration based on content depth. More complex ideas need more time.
For music, prefer: eastern, spiritual, ambient, meditation, indian, flute, bells, no drums, no piano.`;

        const response = await this.callOpenAI(prompt, true);
        return this.parseJSON<ReelPlan>(response);
    }

    /**
     * Generates commentary and image prompts for each segment.
     */
    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        const wordsPerSegment = Math.round(secondsPerSegment * 2.3); // ~2.3 words per second

        const prompt = `Create ${plan.segmentCount} segments for this reel.

Original idea:
"""
${transcript}
"""

Reel concept: ${plan.summary}
Mood: ${plan.mood}
Target: ~${wordsPerSegment} words per segment (${secondsPerSegment.toFixed(1)}s each)

For each segment, provide:
1. commentary: 1-2 punchy sentences (aim for ~${wordsPerSegment} words)
2. imagePrompt: detailed visual description for image generation
3. caption: optional short subtitle text

Respond with a JSON array:
[
  {
    "commentary": "...",
    "imagePrompt": "...",
    "caption": "..."
  },
  ...
]

Guidelines:
- Commentary should flow naturally when read aloud
- Each segment should build on the previous one
- Image prompts should be vivid, specific, and atmospheric
- Avoid clichés; be original and thought-provoking`;

        const response = await this.callOpenAI(prompt, true);
        return this.parseJSON<SegmentContent[]>(response);
    }

    /**
     * Adjusts commentary length to better match target duration.
     */
    async adjustCommentaryLength(
        segments: SegmentContent[],
        direction: 'shorter' | 'longer',
        targetDurationSeconds: number
    ): Promise<SegmentContent[]> {
        const wordsPerSegment = Math.round(
            (targetDurationSeconds / segments.length) * 2.3
        );

        const prompt = `Adjust these segment commentaries to be ${direction}.

Current segments:
${JSON.stringify(segments, null, 2)}

Target: ~${wordsPerSegment} words per segment for ${targetDurationSeconds}s total.

Rules:
- Make each commentary ${direction === 'shorter' ? 'more concise' : 'slightly more developed'}
- Keep the same meaning and impact
- Maintain the Challenging View voice
- Keep image prompts unchanged

Respond with the adjusted JSON array in the same format.`;

        const response = await this.callOpenAI(prompt, true);
        return this.parseJSON<SegmentContent[]>(response);
    }

    private async callOpenAI(prompt: string, jsonMode: boolean = false): Promise<string> {
        try {
            const response = await axios.post(
                `${this.baseUrl}/v1/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        { role: 'system', content: CHALLENGING_VIEW_SYSTEM_PROMPT },
                        { role: 'user', content: prompt },
                    ],
                    temperature: 0.7,
                    ...(jsonMode && { response_format: { type: 'json_object' } }),
                },
                {
                    headers: {
                        Authorization: `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                    },
                }
            );

            return response.data.choices[0].message.content;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                const message = error.response?.data?.error?.message || error.message;
                throw new Error(`LLM call failed: ${message}`);
            }
            throw error;
        }
    }

    private parseJSON<T>(response: string): T {
        try {
            // Handle potential markdown code blocks
            const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch {
            throw new Error(`Failed to parse LLM response as JSON: ${response.substring(0, 200)}...`);
        }
    }
}
