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
     * SEGMENT COUNT is calculated mathematically, NOT by LLM.
     */
    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        // Calculate optimal segment count based on duration
        // Each segment should be 4-6 seconds for optimal visual storytelling
        const avgDuration = (constraints.minDurationSeconds + constraints.maxDurationSeconds) / 2;
        const OPTIMAL_SEGMENT_DURATION = 5; // seconds per visual beat
        const calculatedSegmentCount = Math.max(2, Math.min(6, Math.round(avgDuration / OPTIMAL_SEGMENT_DURATION)));

        console.log(`📊 Calculated segment count: ${calculatedSegmentCount} (based on ${avgDuration}s target / ${OPTIMAL_SEGMENT_DURATION}s per segment)`);

        const prompt = `Plan a short-form video reel from this voice note.

Transcript:
"""
${transcript}
"""

Constraints:
- Duration must be between ${constraints.minDurationSeconds} and ${constraints.maxDurationSeconds} seconds
- You MUST use EXACTLY${calculatedSegmentCount} segments (already calculated, do NOT change this)
${constraints.moodOverrides?.length ? `- Mood should incorporate: ${constraints.moodOverrides.join(', ')}` : ''}

Respond with a JSON object containing:
{
  "targetDurationSeconds": <number between ${constraints.minDurationSeconds}-${constraints.maxDurationSeconds}>,
  "segmentCount": ${calculatedSegmentCount},
  "musicTags": ["array", "of", "music", "search", "tags"],
  "musicPrompt": "description for AI music generation if needed",
  "mood": "overall mood/tone",
  "summary": "brief summary of the reel concept"
}

CRITICAL: segmentCount MUST be exactly ${calculatedSegmentCount}. Do not change this number.

Choose duration based on content depth. More complex ideas need more time.`;

        const response = await this.callOpenAI(prompt, true);
        const plan = this.parseJSON<ReelPlan>(response);

        // ENFORCE the calculated segment count (in case LLM ignored us)
        if (plan.segmentCount !== calculatedSegmentCount) {
            console.warn(`⚠️ LLM returned segmentCount=${plan.segmentCount}, forcing to ${calculatedSegmentCount}`);
            plan.segmentCount = calculatedSegmentCount;
        }

        return plan;
    }

    /**
     * Generates commentary and image prompts for each segment.
     */
    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        const wordsPerSegment = Math.round(secondsPerSegment * 2.3); // ~2.3 words per second

        const prompt = `You MUST create EXACTLY ${plan.segmentCount} segments for this reel.

Original transcript:
"""
${transcript}
"""

Reel concept: ${plan.summary}
Mood: ${plan.mood}
Target: ~${wordsPerSegment} words per segment (${secondsPerSegment.toFixed(1)}s each)

CRITICAL REQUIREMENTS:
1. Return a JSON ARRAY of EXACTLY ${plan.segmentCount} objects
2. DO NOT wrap the array in any outer object
3. DO NOT return fewer than ${plan.segmentCount} segments
4. DO NOT return more than ${plan.segmentCount} segments

Expected format (MUST be a JSON object):
{
  "segments": [
    { segment 1 },
    { segment 2 },
    { segment 3 }
  ]
}

Each segment object MUST have these fields:

CRITICAL: For each segment, provide a JSON object with these EXACT fields:

{
  "commentary": "1-2 punchy sentences (~${wordsPerSegment} words) - MUST reference 2-3 visual elements from imagePrompt",
  "imagePrompt": "100-140 word detailed visual description (see rules below)",
  "caption": "optional short subtitle",
  "visualSpecs": {
    "shot": "close-up | medium | wide",
    "lens": "35mm | 50mm | 85mm",
    "framing": "rule-of-thirds | centered | leading-lines",
    "angle": "eye-level | low | high",
    "lighting": "soft-warm | hard-cool | dramatic | natural",
    "colorGrade": "vivid-cinematic | teal-orange | warm-filmic | rich-natural"
  },
  "continuityTags": {
    "location": "specific setting/environment",
    "timeOfDay": "morning/afternoon/evening/night/golden-hour",
    "dominantColor": "primary color palette",
    "heroProp": "key object/prop in scene",
    "wardrobeDetail": "subject clothing/pose detail"
  },
  "deltaSummary": "10-16 words: Because X, the scene now Y (cause→effect)"
}

COMMENTARY-IMAGE LINKAGE (CRITICAL):
★ Generate imagePrompt FIRST with all visual details
★ THEN write commentary that explicitly describes what the viewer SEES
★ Reference 2-3 specific visual elements from the imagePrompt:
  - If image has "golden hour" → commentary says "warm sunset glow" or "amber light"
  - If image has "wooden deck" → commentary says "this peaceful platform" or "natural setting"
  - If image has "meditation pose" → commentary says "stillness" or "centered presence"
  - If image has "misty mountains" → commentary says "distant peaks" or "mountain backdrop"

GOOD Example:
imagePrompt: "wooden deck at golden hour with person meditating, warm amber tones, mountains"
commentary: "Notice the warm amber glow bathing this peaceful deck, where stillness meets nature's mountain backdrop"
(References: golden hour→amber glow, deck→this deck, meditation→stillness, mountains→backdrop)

BAD Example:
imagePrompt: "wooden deck at golden hour with person meditating"
commentary: "Mindfulness reduces stress and brings peace"
(NO visual references - viewer hears abstract concept while seeing concrete scene!)

IMAGE PROMPT RULES (100-140 words each):

Index 1 (Setup):
- Full visual description WITHOUT "Continuation" prefix
- Include: ${plan.summary} visual interpretation
- Specify all visualSpecs elements in natural language within the prompt
- Example start: "A [shot] shot with [lens] lens showing..."

Index 2+ (Progression with CONTINUATION):
- START with: "Continuation of previous scene:"
- Reference AT LEAST TWO continuityTags from previous segment
- Example: "Continuation of previous scene: maintaining the [location] and [dominantColor] palette. Now [progression]..."
- Build narrative progression while keeping visual coherence
- Each segment increases story tension/revelation

VISUAL LANGUAGE:
- Use concrete nouns + sensory verbs
- Max 1 metaphor per prompt
- No buzzwords, no ellipses, no exclamation marks
- Cinematic, high quality for Instagram reel aesthetic

Respond with a JSON array of ${plan.segmentCount} objects matching the structure above exactly.`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<any>(response);

        return this.normalizeSegments(parsed);
    }

    /**
     * Normalizes segment content to ensure it's always an array of SegmentContent.
     */
    private normalizeSegments(data: any): SegmentContent[] {
        // Handle null/undefined
        if (data === null || data === undefined) {
            throw new Error('LLM returned null or undefined segment content');
        }

        // Already an array - ideal case
        if (Array.isArray(data)) {
            console.log(`[LLM] normalizeSegments: received array with ${data.length} items`);
            return data;
        }

        console.log(`[LLM] normalizeSegments: received ${typeof data}, attempting normalization`);

        // Silent unwrap if it's {"segments": [...]}
        if (data && typeof data === 'object' && Array.isArray(data.segments)) {
            console.log(`[LLM] normalizeSegments: unwrapped .segments with ${data.segments.length} items`);
            return data.segments;
        }

        // Silent wrap if it's a single object
        if (data && typeof data === 'object' && data.commentary && data.imagePrompt) {
            console.log(`[LLM] normalizeSegments: wrapped single object`);
            return [data as SegmentContent];
        }

        // Handle numeric keys (sometimes returned by LLMs)
        if (data && typeof data === 'object') {
            const values = Object.values(data);
            if (values.length > 0 && typeof values[0] === 'object' && (values[0] as any).commentary) {
                console.log(`[LLM] normalizeSegments: extracted ${values.length} items from object values`);
                return values as SegmentContent[];
            }
        }

        throw new Error(`LLM returned invalid segments format: ${JSON.stringify(data).substring(0, 200)}`);
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
        const parsed = this.parseJSON<any>(response);

        // CRITICAL: Normalize the response just like generateSegmentContent
        return this.normalizeSegments(parsed);
    }

    private async callOpenAI(prompt: string, jsonMode: boolean = false): Promise<string> {
        const maxRetries = 3;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
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
                    const status = error.response?.status;
                    const message = error.response?.data?.error?.message || error.message;

                    // Retry on transient errors (502, 503, 429)
                    if ((status === 502 || status === 503 || status === 429) && attempt < maxRetries - 1) {
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`[LLM] Transient error (${status}), retrying in ${delay / 1000}s...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                        continue;
                    }

                    throw new Error(`LLM call failed: ${message}`);
                }
                throw error;
            }
        }

        throw new Error('LLM call failed after max retries');
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
