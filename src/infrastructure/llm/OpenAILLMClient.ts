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

Expected format (MUST be a JSON array):
[
  { segment 1 },
  { segment 2 },
  { segment 3 }
]

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
