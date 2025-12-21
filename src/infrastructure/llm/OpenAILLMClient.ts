import axios from 'axios';
import {
    ILLMClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
} from '../../domain/ports/ILLMClient';
import { HookPlan, CaptionAndTags } from '../../domain/entities/Growth';
import { getConfig } from '../../config';

/**
 * System prompt enforcing the "Challenging View" voice.
 */
const CHALLENGING_VIEW_SYSTEM_PROMPT = `You are the audio director for "Challenging View".
Your goal: Author a script that is CAUSTIC, POLITICALLY INCORRECT, and SPIRITUALLY PERSPICACIOUS. You are here to shatter comfortable delusions and expose the raw biological and spiritual mechanics of reality.

VOICE CHARACTERISTICS:
- Accent: A mix between Shashi Tharoor's Indian accent (erudite, precise) and Californian American (relaxed, modern, conversational).
- Diction: Mix of sharp, 1-2 syllable everyday words with high-level technical terms (Hypergamy, Dual Mating Strategy, Madonna-Whore complex). 
- Tone: Direct, challenging, and unapologetic. You do not "suggest"—you declare. You do not use "bland" or "safe" language. 

RHETORICAL STRATEGY:
1. Challenge the Norm: Start by exposing a common societal lie or "polite" delusion.
2. Be Caustic: Use sharp, stinging precision. If a truth is ugly, describe it as such.
3. Propose Solutions: Do not just complain. Propose a cold, hard, or spiritually deep solution or mental framework.
4. Narrative Flow: Your commentary should be the "voice" of the story being told. It is the narration of the script. 
5. Narrative Congruence: The commentary is the STORY, the visuals are the ILLUSTRATION. If your commentary says "A king was betrayed," the visual must show that betrayal. Do NOT narrate what is happening in the meta-sense (e.g., don't say "In this scene we see..."). Just tell the story.

SENTENCE SHAPE & CONSTRAINTS (Non-negotiable):
1. Length: Max 16-18 words per sentence.
2. Structure: AT MOST ONE COMMA per sentence. No em-dashes. One simple metaphor across the WHOLE script at most. ZERO exclamation marks.
3. Subtext: The commentary is the narration of Reality. The visual is the embodiment of that Reality. They must feel like two sides of the same coin.
4. Vocabulary (Commentary): When discussing the "Madonna-Whore complex" in the COMMENTARY, ALWAYS use the correct term "Whore". Do NOT censor it for the voiceover.
5. Vocabulary (Image Prompts): NEVER use the word "Whore" or any explicit/crude terms in the "imagePrompt" field. This will trigger safety filters. Instead, use artistic euphemisms like "seductive aesthetics", "alluring noir style", or "femme fatale energy". 

Archetype: The Brutal Realist / The Provocateur.`;

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
     * Detects whether the user wants an animated video reel based on their transcript.
     * Uses LLM to interpret natural language intent.
     */
    async detectReelMode(transcript: string): Promise<ReelModeDetectionResult> {
        if (!transcript || transcript.trim().length === 0) {
            return {
                isAnimatedMode: false,
                reason: 'Empty transcript defaults to image-based reel',
            };
        }

        const prompt = `Analyze this voice note transcript and determine if the user wants an ANIMATED VIDEO reel or a standard IMAGE-based reel.

Transcript:
"""
${transcript}
"""

DETECTION RULES:
1. Return isAnimatedMode: true if the user mentions ANY of these:
   - "animated", "animation", "animate"
   - "video" (in context of wanting motion/movement)
   - "motion", "moving", "movement"
   - "dynamic visuals", "moving visuals"
   - "cinematic video", "video reel"
   
2. Return isAnimatedMode: false (default) if:
   - No animation-related keywords are found
   - User talks about "images", "pictures", "photos", "slides"
   - User doesn't specify visual preference at all

3. If user describes a specific storyline for the animated video, extract it.

Respond with a JSON object:
{
  "isAnimatedMode": boolean,
  "storyline": "optional string - only if user described a specific storyline for the animation",
  "reason": "brief explanation of why you made this decision"
}`;

        try {
            const response = await this.callOpenAIForDetection(prompt);
            const parsed = this.parseJSON<ReelModeDetectionResult>(response);

            console.log(`[LLM] Reel mode detection: ${parsed.isAnimatedMode ? 'ANIMATED' : 'IMAGES'} - ${parsed.reason}`);

            return {
                isAnimatedMode: parsed.isAnimatedMode ?? false,
                storyline: parsed.storyline,
                reason: parsed.reason ?? 'Detection completed',
            };
        } catch (error) {
            console.warn('[LLM] Reel mode detection failed, defaulting to image mode:', error);
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
- PRIORITY RULE: If the transcript requests a specific duration (e.g. "1 minute", "60 seconds"), you MUST stretch the content to meet that duration. This is the MOST IMPORTANT constraint.
- TECHNICAL INSTRUCTION STRIPPING: Remove all instructions like "animated video reel", "one minute", "caption for", "Part 1" etc. from the script and summary. Use ONLY the core message.
- Plan enough segments to fill the requested time (e.g. 60s = ~12 segments).
- If no duration is requested, choose a duration fitting the content depth.
- NEVER disregard a specific duration request in the voice note.

Respond with a JSON object containing:
{
  "targetDurationSeconds": <number>,
  "segmentCount": <number: duration / 5>,
  "musicTags": ["array", "of", "music", "search", "tags"],
  "musicPrompt": "description for AI music generation",
  "mood": "overall mood/tone",
  "summary": "a narrative, scene-focused summary of the visual story (e.g., 'A traveler crossing a vast desert' instead of 'An exploration of solitude')",
  "mainCaption": "a compelling, hook-driven Instagram/TikTok caption for the video (15-30 words)"
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
        const config = getConfig();
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        // Apply 15% safety margin to prevent overshoot (LLMs often ignore word limits)
        const safetyMargin = 0.85;
        // n8n formula sync: Subtract 0.6s per sentence for pauses/breathing room
        const wordsPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps * safetyMargin);
        // Hard cap is the absolute maximum (without safety margin)
        const hardCapPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps);

        const prompt = `You MUST create EXACTLY ${plan.segmentCount} segments for this reel.

Original transcript:
"""
${transcript}
"""

Reel concept: ${plan.summary}
Mood: ${plan.mood}

⚠️ WORD COUNT IS CRITICAL - FAILURE TO COMPLY = REJECTION ⚠️
Target: ${wordsPerSegment} words per segment MAXIMUM
HARD CAP: ${hardCapPerSegment} words per commentary (DO NOT EXCEED)
Total video: ${plan.targetDurationSeconds}s = ${plan.segmentCount} segments × ${secondsPerSegment.toFixed(1)}s each

CRITICAL REQUIREMENTS:
1. Return a JSON ARRAY of EXACTLY ${plan.segmentCount} objects
2. DO NOT wrap the array in any outer object
3. DO NOT return fewer than ${plan.segmentCount} segments
4. DO NOT return more than ${plan.segmentCount} segments
5. EACH COMMENTARY MUST BE ${wordsPerSegment} WORDS OR FEWER - COUNT THEM!

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
  "commentary": "1-2 SENTENCES ONLY. HARD LIMIT: ${wordsPerSegment} words. PUNCHY, NOT VERBOSE.",
  "imagePrompt": "100-140 word detailed visual description (see rules below)",
  "caption": "A clear, direct description of the INTENT or TOPIC (2-6 words). MUST be distinct from commentary. Example: 'The Biology of Attraction'",
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

STORYTELLING-VISUAL CONGRUENCE (CRITICAL):
★ Generate COMMENTARY (the narrative story) FIRST.
★ THEN generate imagePrompt as a DIRECT ILLUSTRATION of that narrative.
★ If the story mentions a specific subject (e.g., "the prince"), the image must show it.
★ NEVER describe the video in the commentary (e.g., no "this scene shows...").
★ Use evocative, visceral narrative language. Just tell the story.

PHRASING PRESERVATION & EXPANSION (HIGH PRIORITY):
★ TECHNICAL INSTRUCTION REMOVAL: You MUST strip all technical metadata from the final commentary. If the user said "A one-minute video about X", your commentary should ONLY contain the content about X. Never mention "video", "reel", or timing in the final script.
★ STRICT VERBATIM RULE: Use the user's punchiest insights word-for-word. Do NOT paraphrase their core truth.
★ AUTOMATIC EXPANSION: If the user's punchy lines are too short to fill the requested ${plan.targetDurationSeconds}s duration, you MUST add supporting narrative lines that amplify the theme.
★ NARRATIVE INTEGRITY: If you add lines, they must match the sharp, visceral tone of the original insight. Do not add fluff; add depth.
★ YOUR JOB IS TO PACKAGE AND AMPLIFY THEIR TRUTH, NOT REWRITE IT.
★ Avoid "explaining" the user's point. Let the original words and your additional depth carry the weight.

STRICT IMAGE POLICY (NON-NEGOTIABLE):
1. RELATIONSHIPS: If the topic involves love, romance, dating, or marriage, you MUST depict a Heterosexual couple (Man and Woman).
   - STRICT PROHIBITION: Do NOT generate same-sex imagery for romantic topics.
2. STYLE: Stylized 2D Cartoon / Cel-shaded. NO realism. No "corporate diversity" art styles. Keep it cinematic and artistic.

GOOD Narrative Example (Story first, then Illustration):
commentary: "Wealth isn't found in the hoard, but in the courage to walk away from it."
imagePrompt: "A stylized 2D cartoon animation of a monk in simple robes walking away from a golden palace into a misty forest, flat colors, clean line art."

BAD Meta-Description Example (AVOID):
commentary: "This scene shows a monk leaving a palace to symbolize how wealth is a burden."
imagePrompt: "monk leaving palace"
(This is meta-description - AVOID THIS! Just tell the monk's story.)

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
        const segments = this.normalizeSegments(parsed);

        // CRITICAL: Post-generation enforcement - truncate overlong commentaries
        return this.enforceWordLimits(segments, hardCapPerSegment);
    }

    /**
     * Enforces hard word limits on commentaries by truncating at sentence boundaries.
     */
    private enforceWordLimits(segments: SegmentContent[], maxWords: number): SegmentContent[] {
        return segments.map((segment, index) => {
            const words = segment.commentary.trim().split(/\s+/);
            if (words.length <= maxWords) {
                return segment;
            }

            console.warn(
                `[LLM] Segment ${index + 1} exceeded word limit: ${words.length} > ${maxWords}. Truncating...`
            );

            // Try to truncate at sentence boundary
            const truncated = words.slice(0, maxWords);
            let commentary = truncated.join(' ');

            // Find last sentence boundary
            const lastSentenceEnd = Math.max(
                commentary.lastIndexOf('.'),
                commentary.lastIndexOf('!'),
                commentary.lastIndexOf('?')
            );

            if (lastSentenceEnd > commentary.length * 0.6) {
                // Keep complete sentence if it's at least 60% of the text
                commentary = commentary.substring(0, lastSentenceEnd + 1);
            } else {
                // Otherwise just end with ellipsis
                commentary = commentary.trimEnd().replace(/[,;:]?$/, '...');
            }

            return { ...segment, commentary };
        });
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
        const config = getConfig();
        const secondsPerSegment = targetDurationSeconds / segments.length;
        // Apply 15% safety margin to prevent overshoot
        const safetyMargin = direction === 'shorter' ? 0.80 : 0.90; // Stricter for "shorter"
        const wordsPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps * safetyMargin);
        const hardCapPerSegment = Math.round((secondsPerSegment - 0.6) * config.speakingRateWps);

        const prompt = `Adjust these segment commentaries to be ${direction}.

Current segments (Count: ${segments.length}):
${JSON.stringify(segments, null, 2)}

Target Duration: ${targetDurationSeconds}s total (~${secondsPerSegment.toFixed(1)}s per segment).

⚠️ WORD COUNT IS CRITICAL ⚠️
Target: ${wordsPerSegment} words per segment MAXIMUM
HARD CAP: ${hardCapPerSegment} words (DO NOT EXCEED)

RULES:
1. You MUST return EXACTLY ${segments.length} segment objects. Do NOT truncate or merge them.
2. Make each commentary ${direction === 'shorter' ? 'SIGNIFICANTLY MORE CONCISE - cut the fluff!' : 'slightly more developed'}.
3. EACH COMMENTARY MUST BE ${wordsPerSegment} WORDS OR FEWER - COUNT THEM!
4. Keep the same meaning and impact.
5. Maintain the Challenging View voice (Direct, Grounded, Indian/Californian mix).
6. Keep imagePrompts, captions, and all other fields EXACTLY the same.

Expected format (MUST be a JSON object):
{
  "segments": [
    { adjusted segment 1 },
    { adjusted segment 2 },
    ...
  ]
}

Respond with exactly ${segments.length} adjusted segments in the JSON structure requested.`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<any>(response);

        // CRITICAL: Normalize the response AND enforce word limits
        const normalized = this.normalizeSegments(parsed);
        return this.enforceWordLimits(normalized, hardCapPerSegment);
    }

    /**
     * Generates multiple hook options for the reel.
     */
    async generateHooks(transcript: string, plan: ReelPlan, trendContext?: string): Promise<string[]> {
        const trendNote = trendContext
            ? `\nCURRENT TREND CONTEXT: "${trendContext}" - Subtly intersect this trend where natural.`
            : '';

        const prompt = `Generate 5 alternative pattern-breaking hooks for the first 2 seconds of an Instagram Reel.
        
Transcript: "${transcript}"
Concept: "${plan.summary}"${trendNote}

RULES:
1. Max 10 words per hook.
2. Voice: Challenging View (Caustic, Spiritually Perspicacious, Unapologetic).
3. Call out a common self-deception or create immediate tension.
4. Suitable for both spoken audio and on-screen text.
5. Include a mix of styles: questions, call-outs, paradoxes, and shocking facts.
6. PREFER call-out and paradox hooks - these historically score highest on saves and shares.
7. Only use question or shocking-fact when the idea strongly suggests it.

Respond with a JSON object: { "hooks": ["hook 1", "hook 2", ...] }`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<{ hooks: string[] }>(response);
        return parsed.hooks || [];
    }

    /**
     * Generates an expanded caption and hashtags optimized for virality.
     */
    async generateCaptionAndTags(fullScript: string, summary: string): Promise<CaptionAndTags> {
        const prompt = `Write a high-performance Instagram caption and hashtags for this reel.

Script: "${fullScript}"
Summary: "${summary}"

CAPTION RULES:
1. 2-4 short lines maximum.
2. Tone: Challenging View (Sharp, grounded, psychological).
3. NEVER use fluffy wellness clichés.
4. ALWAYS end with one concise call-to-action optimized for SAVES or SHARES, not likes.
5. Make the CTA feel like a personal challenge or reminder, NOT a marketing line.
6. Good CTAs: "Save this for when you need it." / "Send this to someone who needs to hear it."
7. Bad CTAs: "Like if you agree!" / "Follow for more!" / "Double tap!"

HASHTAG RULES:
1. Exactly 9-11 hashtags.
2. 3-5 niche (spiritual psychology, shadow work, self-inquiry, etc.).
3. 3-5 broad (#reels, #spirituality, #selfawareness, #mentalhealth).
4. 1-2 branded (#ChallengingView).
5. DO NOT repeat the exact same hashtag bundle every time - rotate to avoid hashtag fatigue.

Respond with a JSON object:
{
  "captionBody": "...",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

        const response = await this.callOpenAI(prompt, true);
        return this.parseJSON<CaptionAndTags>(response);
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

    /**
     * Calls OpenAI for intent detection with neutral system prompt.
     * Used for reel mode detection where we don't want the Challenging View voice.
     */
    private async callOpenAIForDetection(prompt: string): Promise<string> {
        const response = await axios.post(
            `${this.baseUrl}/v1/chat/completions`,
            {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an intent detection assistant. Analyze user input and return structured JSON responses. Be precise and factual.'
                    },
                    { role: 'user', content: prompt },
                ],
                temperature: 0.3, // Lower temperature for more deterministic detection
                response_format: { type: 'json_object' },
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data.choices[0].message.content;
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
