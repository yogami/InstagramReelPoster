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
const CHALLENGING_VIEW_SYSTEM_PROMPT = `You are the audio director for "Challenging View".
Your goal: Author a script that conveys implication, intention, contrast, and stakes.

CORE RULES (Non-negotiable):
1. Subtext v. Description: NEVER describe the visual. Do not list objects, colors, or lighting. The image exists; your job is to add meaning, not captions.
2. Diction: Use "Gen-Z Simple English" mixed with philosophical depth. Short, everyday words (1-2 syllables). No corporate jargon. No academic density. Prefer "help, build, harm" over complex synonyms.
3. Sentence Shape: Max 16-18 words per sentence. Simple syntax. No em-dashes. ZERO exclamation marks.
4. Tone: Calm, grounded, non-lecture. Avoid buzzwords. Use soft questions and direct statements.
5. Content: One simple metaphor per script max.
6. Alignment: Each sentence must match the visual beat emotionally, but not descriptively.

Archetype: Sage-calm / Mentor-parable.
- Low register feel.
- Simple moral insights with gentle certainty.
- Comfortable challenging illusions.`;

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
        // Calculate default for fallback
        const avgDuration = (constraints.minDurationSeconds + constraints.maxDurationSeconds) / 2;
        const OPTIMAL_SEGMENT_DURATION = 5;

        // We allow the LLM to decide the duration if the user asks for it, otherwise default to context
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

CRITICAL: segmentCount must be an Integer between 2 and 15.`;

        const response = await this.callOpenAI(prompt, true);
        const plan = this.parseJSON<ReelPlan>(response);

        // Safety CLAMP on segment count
        if (plan.segmentCount < 2) plan.segmentCount = 2;
        if (plan.segmentCount > 15) plan.segmentCount = 15;

        console.log(`[ReelPlan] Targeted ${plan.targetDurationSeconds}s with ${plan.segmentCount} segments.`);


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
  "commentary": "1-2 punchy sentences (~${wordsPerSegment} words) - Focus on the MESSAGE, not the visual",
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

COMMENTARY-IMAGE CONGRUENCE (CRITICAL):
★ Generate imagePrompt FIRST with all visual details
★ THEN write commentary that is THEMATICALLY and EMOTIONALLY aligned with the image
★ DO NOT describe what the viewer sees - they can already see it
★ Instead, deliver the spiritual/philosophical insight that the visual supports

STRICT IMAGE POLICY (NON-NEGOTIABLE):
1. RACE/ETHNICITY: People must be race-neutral / ambiguous. Do not specify specific ethnicities. Describe "a person", "a silhouette", "a figure" with ambiguous features. The goal is universal relatability.
2. RELATIONSHIPS: If the topic involves love, romance, dating, or marriage, and you show a couple, it MUST be a Heterosexual couple (Man and Woman). Do NOT depict same-sex couples for romantic themes.
★ The image should ILLUSTRATE the idea, not BE the idea

STORYTELLING APPROACH:
- Commentary delivers the insight, teaching, or provocation
- Image provides the emotional/atmospheric backdrop
- They work together but serve different roles
- Avoid phrases like "notice the..." "see how..." "this scene shows..."

GOOD Example:
imagePrompt: "wooden deck at golden hour with person meditating, warm amber tones, mountains"
commentary: "You think you need more time to find peace. But peace isn't found in time—it's found in the absence of seeking."
(Image sets contemplative mood; commentary delivers the insight)

BAD Example:
imagePrompt: "wooden deck at golden hour with person meditating"
commentary: "Notice the warm amber glow bathing this peaceful deck, where stillness meets nature's mountain backdrop"
(This is describing the image like a tour guide - AVOID THIS!)

ANOTHER GOOD Example:
imagePrompt: "close-up of hands releasing sand, soft morning light, beach setting"
commentary: "Every attachment you defend is a prison you've built with your own hands."
(Image provides metaphor; commentary delivers the punch)

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
