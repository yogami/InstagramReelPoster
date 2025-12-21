import axios from 'axios';
import {
    ILLMClient,
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
    ReelModeDetectionResult,
    ContentModeDetectionResult,
} from '../../domain/ports/ILLMClient';
import { HookPlan, CaptionAndTags } from '../../domain/entities/Growth';
import {
    ContentMode,
    ParableIntent,
    ParableSourceChoice,
    ParableScriptPlan,
    ParableBeat,
    isParableIntent,
    isParableScriptPlan,
} from '../../domain/entities/Parable';
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
        const parsed = this.parseJSON<any>(response);

        let hashtags: string[] = [];
        if (Array.isArray(parsed.hashtags)) {
            hashtags = parsed.hashtags;
        } else if (typeof parsed.hashtags === 'string') {
            hashtags = parsed.hashtags.split(/[\s,]+/).filter((t: string) => t.length > 0);
        }

        // Ensure every tag has a # and is cleaned
        hashtags = hashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`).filter((t: string) => t !== '#');

        // Ensure hashtags is at least an empty array to prevent undefined errors
        if (hashtags.length === 0) {
            console.warn('[LLM] generateCaptionAndTags returned no hashtags, providing defaults');
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

    // ============================================
    // PARABLE MODE METHODS
    // ============================================

    /**
     * Detects whether the transcript is story-oriented (parable) or direct commentary.
     */
    async detectContentMode(transcript: string): Promise<ContentModeDetectionResult> {
        if (!transcript || transcript.trim().length === 0) {
            return {
                contentMode: 'direct-message',
                reason: 'Empty transcript defaults to direct-message mode'
            };
        }

        const prompt = `Analyze this voice note transcript and determine if it's asking for a PARABLE/STORY or DIRECT COMMENTARY.

Transcript:
"""
${transcript}
"""

PARABLE KEYWORDS (return "parable" if any are present):
- "story", "tale", "parable", "once upon"
- "monk", "sage", "saint", "warrior", "king", "farmer"
- "ancient", "old tale", "legend", "fable"
- References to Zen, Sufi, Buddhist, Hindu, or folklore stories
- Describing characters, scenes, or narratives

DIRECT-MESSAGE (default - return this if no story indicators):
- Commentary, rant, thoughts, opinions
- Discussing concepts without narrative framing
- Educational or explanatory content

Respond with JSON:
{
  "contentMode": "parable" or "direct-message",
  "reason": "brief explanation"
}`;

        try {
            const response = await this.callOpenAIForDetection(prompt);
            const parsed = this.parseJSON<{ contentMode?: string; reason?: string }>(response);

            const contentMode: ContentMode = parsed.contentMode === 'parable' ? 'parable' : 'direct-message';
            return {
                contentMode,
                reason: parsed.reason || 'No reason provided'
            };
        } catch (error) {
            console.warn('[LLM] Content mode detection failed, defaulting to direct-message:', error);
            return {
                contentMode: 'direct-message',
                reason: 'Detection failed, defaulting to direct-message'
            };
        }
    }

    /**
     * Extracts parable intent from transcript.
     */
    async extractParableIntent(transcript: string): Promise<ParableIntent> {
        const prompt = `Extract the parable intent from this transcript.

Transcript:
"""
${transcript}
"""

Determine:
1. sourceType: 
   - "provided-story" if user describes a specific tale, character, or historical figure (e.g., Ekalavya, Buddha, Chanakya)
   - "theme-only" if user discusses an abstract theme/idea without specifying a story

2. coreTheme: The psychological/spiritual theme (e.g., "gossip", "envy", "spiritual bypassing", "ego", "attachment", "atomic habits", "discipline")

3. moral: 1-2 sentence insight the user wants to convey

4. culturalPreference (optional): If user mentions or implies a culture ("indian", "chinese", "japanese", "sufi", "western-folklore", "generic-eastern")

5. constraints (optional): Any specific requirements (e.g., "must be about a monk", "warrior archetype")

6. providedStoryContext (CRITICAL for provided-story): If sourceType is "provided-story", extract ALL specific details:
   - Character names mentioned (e.g., "Ekalavya", "Dronacharya", "Arjuna")
   - Historical/mythological context
   - Specific story elements the user described
   - Key plot points or actions mentioned
   This preserves the user's exact story request.

Respond with JSON:
{
  "sourceType": "provided-story" or "theme-only",
  "coreTheme": "...",
  "moral": "...",
  "culturalPreference": "optional...",
  "constraints": ["optional array..."],
  "providedStoryContext": "For provided-story only: Full context with character names and story details"
}`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<ParableIntent>(response);

        // Validate and provide defaults
        return {
            sourceType: parsed.sourceType === 'provided-story' ? 'provided-story' : 'theme-only',
            coreTheme: parsed.coreTheme || 'spiritual insight',
            moral: parsed.moral || 'The truth is always uncomfortable.',
            culturalPreference: parsed.culturalPreference,
            constraints: parsed.constraints,
            providedStoryContext: parsed.providedStoryContext
        };
    }

    /**
     * Chooses story-world for theme-only parables.
     */
    async chooseParableSource(intent: ParableIntent): Promise<ParableSourceChoice> {
        const prompt = `Choose the best story-world for this parable intent.

Theme: ${intent.coreTheme}
Moral: ${intent.moral}
${intent.culturalPreference ? `User preference: ${intent.culturalPreference}` : ''}
${intent.constraints?.length ? `Constraints: ${intent.constraints.join(', ')}` : ''}

CULTURES (pick one that best expresses the theme):
- indian: Hindu, Vedantic, yoga traditions
- chinese: Chan/Zen Buddhism, Taoist tales
- japanese: Zen, samurai, bushido
- sufi: Islamic mysticism, Rumi-style
- western-folklore: Christian monastics, medieval saints, mythic kings
- generic-eastern: Universal "ancient master" archetype

ARCHETYPES (pick one):
- monk: Renunciant, ascetic, meditative
- sage: Wise elder, teacher
- saint: Devoted, miraculous
- warrior: Fighter, samurai, general
- king: Ruler, leader
- farmer: Simple, grounded
- villager: Community member
- student: Learner, seeker

Respond with JSON:
{
  "culture": "...",
  "archetype": "...",
  "rationale": "Why this combination fits the theme"
}`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<ParableSourceChoice>(response);

        return {
            culture: parsed.culture || 'generic-eastern',
            archetype: parsed.archetype || 'sage',
            rationale: parsed.rationale || 'Default selection'
        };
    }

    /**
     * Generates complete parable script with 4-beat structure.
     */
    async generateParableScript(
        intent: ParableIntent,
        sourceChoice: ParableSourceChoice,
        targetDurationSeconds: number
    ): Promise<ParableScriptPlan> {
        const config = getConfig();
        const wordsPerSecond = config.speakingRateWps;

        // Enforce minimum 30s for parables to avoid short videos
        const effectiveDuration = Math.max(targetDurationSeconds, 30);
        const totalWords = Math.floor(effectiveDuration * wordsPerSecond * 0.85); // 15% safety margin

        // Build story context section for provided-story mode
        const storyContextSection = intent.providedStoryContext
            ? `
USER'S SPECIFIC STORY (CRITICAL - USE THESE EXACT CHARACTERS AND DETAILS):
"""
${intent.providedStoryContext}
"""
YOU MUST use the specific character names and story elements from above. Do NOT invent generic characters.
`
            : '';

        const prompt = `Generate a micro-parable for short-form video.

=== NICHE POSITIONING ===
You are creating content for "Faceless parable-based spiritual psychology":
- Short animated stories about monks, warriors, saints, etc.
- Each story EXPOSES ONE uncomfortable truth about ego, gossip, avoidance, projection, bypassing
- NOT generic spirituality. Specific PSYCHOLOGICAL mechanics.
- Think: "micro-documentary of one inner behavior" not "sermon"

=== ONE THEME, ONE MORAL ===
THEME: ${intent.coreTheme}
MORAL: ${intent.moral}
CULTURE: ${sourceChoice.culture}
ARCHETYPE: ${sourceChoice.archetype}
${intent.constraints?.length ? `CONSTRAINTS: ${intent.constraints.join(', ')}` : ''}
${storyContextSection}

=== DOCUMENTARY STRUCTURE ===
Treat this parable like a micro-documentary of ONE inner behavior:
- Show the CHARACTER'S DECISION POINT: "Do I gossip or face myself?"
- Show the EMOTIONAL STAKES: What they're avoiding, what they fear
- Show the CONSEQUENCES: The cost of the choice

TARGET DURATION: ${effectiveDuration} seconds (CRITICAL - must reach this duration!)
WORD BUDGET: ~${totalWords} words total (DO NOT go shorter)

=== 4-BEAT STRUCTURE ===
1. HOOK (8-10 seconds): FIRST SENTENCE MUST GRAB IN 1-3 SECONDS.
   Pattern: "The [archetype] who [unexpected twist on the theme]"
   Example: "The monk whose favorite prayer was gossip."
   Example: "The warrior who feared his own silence more than battle."
   
   CRITICAL: The first sentence alone must make viewer stop scrolling.
   - Promise a specific revelation
   - Create immediate cognitive dissonance
   - NO buildup - start with the twist

2. SETUP (10-14 seconds): Show who they are and their HIDDEN tension.
   - What they do on the surface
   - What they're actually avoiding
   - Build the gap between appearance and reality
   - Use SIMPLE 5th-8th grade language (avoid dense philosophy)

3. TURN (10-12 seconds): The CONFRONTATION that exposes the truth.
   START WITH A RE-HOOK LINE to renew curiosity:
   - "But here's what nobody told him..."
   - "What happened next shocked everyone in the monastery."
   - "And then, the teacher said one thing that changed everything."
   
   Then show:
   - A teacher's piercing question
   - A crisis that strips the mask
   - The moment they can't hide anymore

4. MORAL (8-10 seconds): Contemporary insight that MIRRORS THE VIEWER.
   - Don't lecture. Implicate.
   - Make it uncomfortable: "Sound familiar?"
   - Sharp, caustic, psychologically aware
   - The viewer should feel seen, not preached to

=== VOICEOVER TONALITY ===
- Sound like a CALM NARRATOR DESCRIBING A DISASTER IN SLOW MOTION
- Emotionally loaded but NOT shouty
- Controlled intensity, not preaching
- Think: documentary narrator revealing something uncomfortable

=== LANGUAGE RULES ===
- Use 5th-8th grade vocabulary
- Short sentences. Simple words.
- NO dense philosophy. NO spiritual jargon.
- The simpler the language, the sharper the impact.

=== VISUAL MOOD RULES ===
Image prompts must encode emotional beats through color and composition:
- HOOK: Neutral palette, establishing shot
- SETUP: Warm but muted tones, surface appearance
- TURN (Confrontation/Betrayal): DARKER palette, shadows, tension in composition
- MORAL (Realization): BRIGHTER palette, light breaking through, clarity

Additional visual rules:
- SIMPLE, SYMBOLIC scenes (monk in courtyard, warrior at campfire, gossip circle)
- Minimal motion, clean composition
- NO complex effects or busy visuals
- The simplicity IS the hook - viewer focuses on message, not FX
- Repeating visual motifs across beats (same courtyard, same characters)
- Style: "2D cel-shaded, hand-drawn feeling, Studio Ghibli simplicity"

=== CHARACTER REQUIREMENTS ===
- Use SPECIFIC character names from the story (Ekalavya, Dronacharya, NOT "a boy" or "the teacher")
- Each character should represent a recognizable inner dynamic
- The protagonist IS the viewer's shadow

CRITICAL DURATION CHECK: 
- MINIMUM total must be ${effectiveDuration}s
- Each beat MUST meet minimum: 8+10+10+8 = 36s minimum
- Aim for upper ranges: 10+14+12+10 = 46s is ideal

Respond with JSON:
{
  "mode": "parable",
  "parableIntent": {
    "sourceType": "${intent.sourceType}",
    "coreTheme": "${intent.coreTheme}",
    "moral": "${intent.moral}"
  },
  "sourceChoice": {
    "culture": "${sourceChoice.culture}",
    "archetype": "${sourceChoice.archetype}",
    "rationale": "${sourceChoice.rationale}"
  },
  "beats": [
    {
      "role": "hook",
      "narration": "First sentence MUST grab in 1-3 seconds...",
      "textOnScreen": "...",
      "imagePrompt": "2D cel-shaded, hand-drawn, [symbolic establishing shot], NEUTRAL palette",
      "approxDurationSeconds": 8-10
    },
    {
      "role": "setup",
      "narration": "Simple 5th-8th grade language...",
      "textOnScreen": "...",
      "imagePrompt": "2D cel-shaded, hand-drawn, [character in setting], WARM MUTED tones",
      "approxDurationSeconds": 10-14
    },
    {
      "role": "turn",
      "narration": "START WITH RE-HOOK: 'But here's what nobody told him...'",
      "textOnScreen": "...",
      "imagePrompt": "2D cel-shaded, hand-drawn, [confrontation scene], DARKER palette, shadows, tension",
      "approxDurationSeconds": 10-12
    },
    {
      "role": "moral",
      "narration": "Mirror the viewer, implicate, not lecture...",
      "textOnScreen": "...",
      "imagePrompt": "2D cel-shaded, hand-drawn, [realization moment], BRIGHTER palette, light breaking through",
      "approxDurationSeconds": 8-10
    }
  ]
}`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<ParableScriptPlan>(response);

        // Validate structure
        if (!isParableScriptPlan(parsed)) {
            throw new Error('Invalid parable script structure from LLM');
        }

        return parsed;
    }

    /**
     * Generates hooks specifically for parable content.
     */
    async generateParableHooks(
        parableScript: ParableScriptPlan,
        trendContext?: string
    ): Promise<string[]> {
        const hookBeat = parableScript.beats.find(b => b.role === 'hook');

        const prompt = `Generate 5 viral hooks for this spiritual psychology parable.

=== NICHE POSITIONING ===
You are creating hooks for "Faceless parable-based spiritual psychology" content.
These hooks must PROMISE a surprising angle on a familiar, uncomfortable topic.
Think: documentary reveal, not sermon announcement.

PARABLE CONTEXT:
- Theme: ${parableScript.parableIntent.coreTheme}
- Moral: ${parableScript.parableIntent.moral}
- Culture: ${parableScript.sourceChoice.culture}
- Archetype: ${parableScript.sourceChoice.archetype}
- Current hook: ${hookBeat?.narration || 'Not available'}
${trendContext ? `- Trend context: ${trendContext}` : ''}

=== HOOK FORMULA (Documentary/Explainer Style) ===
Pattern 1: "The [archetype] who [unexpected twist on theme]"
  - "The monk whose favorite prayer was gossip."
  - "The warrior who feared his own silence more than battle."

Pattern 2: "What actually happens when [familiar behavior]"
  - "What actually happens when spiritual people gossip."
  - "The psychology behind 'I'm just concerned.'"

Pattern 3: Implicating statement that mirrors viewer
  - "His prayers were whispers about others."
  - "He could sit in stillness for hours. But his words never rested."

=== REQUIREMENTS ===
- Reference character + tension
- Pattern-breaking, attention-grabbing
- NO questions (statements work better for parables)
- Promise a REVEAL, not a lesson
- Each hook should feel like the title of a mini-documentary

Respond with JSON:
{
  "hooks": [
    "Hook 1...",
    "Hook 2...",
    "Hook 3...",
    "Hook 4...",
    "Hook 5..."
  ]
}`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<{ hooks: string[] }>(response);

        return parsed.hooks || [hookBeat?.narration || 'A story of spiritual awakening.'];
    }

    /**
     * Generates captions optimized for parable content.
     */
    async generateParableCaptionAndTags(
        parableScript: ParableScriptPlan,
        summary: string
    ): Promise<CaptionAndTags> {
        const prompt = `Generate a caption and hashtags for this spiritual psychology parable reel.

=== NICHE POSITIONING ===
You are creating a caption for "Faceless parable-based spiritual psychology" content.
Frame this as a DOCUMENTARY/EXPLAINER, not a sermon.

PARABLE SUMMARY: ${summary}
THEME: ${parableScript.parableIntent.coreTheme}
MORAL: ${parableScript.parableIntent.moral}
CULTURE: ${parableScript.sourceChoice.culture}
ARCHETYPE: ${parableScript.sourceChoice.archetype}

=== CAPTION STRUCTURE (Documentary/Explainer Style) ===
1. OPENING LINE (Documentary framing):
   Pattern: "This is the story of what really happens when [behavior]."
   Or: "A [archetype] who [unexpected twist]."
   This positions the reel as education via story.

2. MIDDLE (2-3 short lines):
   - Summarize the parable's core tension in modern language
   - Connect it to a behavior the viewer recognizes in themselves or others
   - NO preaching. Just observation.

3. FINAL LINE (Viewer mirror + CTA):
   Make the viewer feel implicated, then give clear action:
   - "Sound familiar?"
   - "Save this for the next time you catch yourself doing this."
   - "Your excuses are showing."

=== HASHTAG STRATEGY (10-12 total) ===
NICHE PSYCHOLOGY TAGS (4-5):
  #shadowwork #selfinquiry #egodeath #spiritualpsychology #projection

BROADER REACH TAGS (3-4):
  #spirituality #mindfulness #reels #wisdom #growth

BRAND + PARABLE SPECIFIC (3):
  #ChallengingView #parables #spiritualstorytelling

Respond with JSON:
{
  "captionBody": "Opening documentary line\\n\\nMiddle observation lines\\n\\nFinal mirror + CTA",
  "hashtags": ["#tag1", "#tag2", ...]
}`;

        const response = await this.callOpenAI(prompt, true);
        const parsed = this.parseJSON<any>(response);

        let hashtags: string[] = [];
        if (Array.isArray(parsed.hashtags)) {
            hashtags = parsed.hashtags;
        } else if (typeof parsed.hashtags === 'string') {
            hashtags = (parsed.hashtags as string).split(/[\s,]+/).filter((t: string) => t.length > 0);
        }

        // Ensure every tag has a # and is cleaned
        hashtags = hashtags.map((t: string) => t.startsWith('#') ? t : `#${t}`).filter((t: string) => t !== '#');

        // Ensure minimum hashtags
        if (hashtags.length < 8) {
            const defaults = ['#ChallengingView', '#parables', '#spirituality', '#reels', '#shadowwork', '#selfinquiry', '#spiritualstorytelling', '#mindfulness'];
            for (const tag of defaults) {
                if (!hashtags.includes(tag)) {
                    hashtags.push(tag);
                }
                if (hashtags.length >= 10) break;
            }
        }

        return {
            captionBody: parsed.captionBody || `A ${parableScript.sourceChoice.archetype}'s lesson in ${parableScript.parableIntent.coreTheme}.\n\nSave this.`,
            hashtags
        };
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

    /**
     * Selects music tags based on content analysis.
     * Analyzes transcript, mood, and cultural context to pick optimal music tags.
     */
    async selectMusicTags(
        transcript: string,
        mood: string,
        culture?: string
    ): Promise<string[]> {
        const prompt = `You are a music curator for short-form video content.

CONTENT:
"""
${transcript.substring(0, 500)}
"""

MOOD: ${mood}
${culture ? `CULTURE HINT: ${culture}` : ''}

AVAILABLE MUSIC TAGS (pick 3-5 that best match the content):
- Culture: indian, chinese, japanese, arabic, african, latin, western
- Mood: epic, motivational, uplifting, dark, calm, meditation, suspense
- Style: cinematic, ambient, psychedelic, classical, tribal, electronic
- Theme: spiritual, heroic, mysterious, romantic, sci-fi, alien, zen, adventure

SELECTION RULES:
1. If content mentions India, Mahabharata, Krishna, Vedic → include "indian"
2. If content mentions China, Tao, Confucius, Emperor → include "chinese"
3. If content mentions Japan, Samurai, Zen, Bushido → include "japanese"
4. If content mentions aliens, space, future, sci-fi → include "psychedelic", "ambient", "alien"
5. If content is motivational, achievement → include "epic", "motivational", "uplifting"
6. If content is dark, suspenseful → include "dark", "suspense"
7. Always include mood-related tags

Return ONLY a JSON object: { "tags": ["tag1", "tag2", "tag3", ...] }`;

        try {
            const response = await this.callOpenAI(prompt, true);
            const result = this.parseJSON<{ tags: string[] }>(response);

            console.log(`[MusicTags] Selected: ${result.tags.join(', ')}`);
            return result.tags || ['meditation', 'calm', 'ambient'];
        } catch (error) {
            console.error('Failed to select music tags via LLM:', error);
            // Fallback to basic mood-based selection
            return this.fallbackMusicTags(mood, culture);
        }
    }

    /**
     * Fallback music tag selection without LLM.
     */
    private fallbackMusicTags(mood: string, culture?: string): string[] {
        const tags: string[] = [];

        // Culture-based tags
        if (culture) {
            const lowerCulture = culture.toLowerCase();
            if (lowerCulture.includes('india')) tags.push('indian', 'spiritual');
            else if (lowerCulture.includes('chines') || lowerCulture.includes('china')) tags.push('chinese', 'asian');
            else if (lowerCulture.includes('japan')) tags.push('japanese', 'zen');
            else if (lowerCulture.includes('arab')) tags.push('arabic', 'middle-eastern');
            else if (lowerCulture.includes('africa')) tags.push('african', 'tribal');
        }

        // Mood-based tags
        const lowerMood = mood.toLowerCase();
        if (lowerMood.includes('epic') || lowerMood.includes('heroic')) tags.push('epic', 'cinematic');
        else if (lowerMood.includes('dark') || lowerMood.includes('suspense')) tags.push('dark', 'suspense');
        else if (lowerMood.includes('calm') || lowerMood.includes('peaceful')) tags.push('meditation', 'calm');
        else if (lowerMood.includes('motivat') || lowerMood.includes('inspir')) tags.push('uplifting', 'motivational');
        else tags.push('ambient', 'meditation'); // Default

        return tags.slice(0, 5);
    }
}
