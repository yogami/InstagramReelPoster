import {
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
} from '../../domain/ports/ILLMClient';
import { CaptionAndTags } from '../../domain/entities/Growth';
import { getConfig } from '../../config';
import { OpenAIService } from './OpenAIService';
import {
    CHALLENGING_VIEW_SYSTEM_PROMPT,
    PLAN_REEL_PROMPT,
    GENERATE_COMMENTARY_PROMPT,
    GENERATE_VISUALS_FROM_COMMENTARY_PROMPT,
} from './Prompts';

/**
 * Handles generation of standard (image-based) reel content.
 */
export class StandardReelGenerator {
    private readonly openAI: OpenAIService;

    constructor(openAI: OpenAIService) {
        this.openAI = openAI;
    }

    /**
     * Plans the structure of a reel based on the transcript.
     */
    async planReel(transcript: string, constraints: PlanningConstraints): Promise<ReelPlan> {
        const prompt = PLAN_REEL_PROMPT
            .replace('{{transcript}}', transcript)
            .replace('{{minDurationSeconds}}', constraints.minDurationSeconds.toString())
            .replace('{{maxDurationSeconds}}', constraints.maxDurationSeconds.toString());

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const plan = this.openAI.parseJSON<ReelPlan>(response);

        // Enforce segment count based on duration constraints (aim for ~5s segments)
        // This ensures consistent pacing regardless of LLM hallucinations
        const avgDuration = (constraints.minDurationSeconds + constraints.maxDurationSeconds) / 2;
        const enforcedSegmentCount = Math.round(avgDuration / 5);

        if (plan.segmentCount !== enforcedSegmentCount) {
            console.log(`[ReelPlan] Overriding LLM segment count ${plan.segmentCount} with calculated ${enforcedSegmentCount}`);
            plan.segmentCount = enforcedSegmentCount;
        }

        // Safety CLAMP on segment count
        if (plan.segmentCount < 2) plan.segmentCount = 2;
        if (plan.segmentCount > 15) plan.segmentCount = 15;

        console.log(`[ReelPlan] Targeted ${plan.targetDurationSeconds}s with ${plan.segmentCount} segments.`);

        return plan;
    }

    /**
     * Generates commentary and image prompts for each segment using a 2-step workflow.
     * Step 1: Generate Commentary (Simple English, Gen Z focus)
     * Step 2: Generate Visuals (Based on commentary)
     */
    async generateSegmentContent(plan: ReelPlan, transcript: string): Promise<SegmentContent[]> {
        const config = getConfig();
        const secondsPerSegment = plan.targetDurationSeconds / plan.segmentCount;
        const safetyMargin = 0.98;

        // Calculate strict word limits
        const wordsPerSegment = Math.round((secondsPerSegment - 0.5) * config.speakingRateWps * safetyMargin);
        const hardCapPerSegment = Math.floor((secondsPerSegment - 0.2) * config.speakingRateWps);

        console.log(`[StandardReel] Step 1: Generating commentary for ${plan.segmentCount} segments (Target: ${wordsPerSegment} words)`);

        // Step 1: Generate Commentary
        const commentaries = await this.generateCommentary(plan, transcript, wordsPerSegment, hardCapPerSegment);

        console.log(`[StandardReel] Step 2: Generating visuals for ${commentaries.length} segments`);

        // Step 2: Generate Visuals
        const visuals = await this.generateVisuals(plan, commentaries);

        // Merge results
        const segments: SegmentContent[] = commentaries.map((comm, index) => {
            const visual = visuals[index] || {
                imagePrompt: 'Minimalist spiritual background, moody lighting',
                caption: 'Watch now',
                continuityTags: {
                    location: 'minimalist void',
                    timeOfDay: 'neutral',
                    dominantColor: 'grey',
                    heroProp: 'none',
                    wardrobeDetail: 'none'
                }
            };
            return {
                commentary: comm.commentary,
                imagePrompt: visual.imagePrompt,
                caption: visual.caption,
                continuityTags: visual.continuityTags
            };
        });

        // CRITICAL: Post-generation enforcement - truncate overlong commentaries
        return this.enforceWordLimits(segments, hardCapPerSegment);
    }

    private async generateCommentary(
        plan: ReelPlan,
        transcript: string,
        wordsPerSegment: number,
        hardCapPerSegment: number
    ): Promise<{ commentary: string }[]> {
        const prompt = GENERATE_COMMENTARY_PROMPT
            .replace(/{{segmentCount}}/g, plan.segmentCount.toString())
            .replace('{{transcript}}', transcript)
            .replace('{{summary}}', plan.summary)
            .replace(/{{wordsPerSegment}}/g, wordsPerSegment.toString())
            .replace(/{{hardCapPerSegment}}/g, hardCapPerSegment.toString());

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ commentary: string }[]>(response);

        if (!Array.isArray(parsed) || parsed.length === 0) {
            throw new Error('Failed to generate valid commentary array');
        }

        return parsed;
    }

    private async generateVisuals(
        plan: ReelPlan,
        commentaries: { commentary: string }[]
    ): Promise<{
        imagePrompt: string;
        caption: string;
        continuityTags: {
            location: string;
            timeOfDay: string;
            dominantColor: string;
            heroProp: string;
            wardrobeDetail: string;
        };
    }[]> {
        const commentaryText = commentaries.map((c, i) => `Segment ${i + 1}: "${c.commentary}"`).join('\n');

        const prompt = GENERATE_VISUALS_FROM_COMMENTARY_PROMPT
            .replace('{{summary}}', plan.summary)
            .replace('{{mood}}', plan.mood)
            .replace('{{segmentCount}}', plan.segmentCount.toString())
            .replace('{{commentaries}}', commentaryText);

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{
            imagePrompt: string;
            caption: string;
            continuityTags: {
                location: string;
                timeOfDay: string;
                dominantColor: string;
                heroProp: string;
                wardrobeDetail: string;
            }
        }[]>(response);

        if (!Array.isArray(parsed)) {
            // Fallback if structure is weird
            return commentaries.map(() => ({
                imagePrompt: 'Abstract spiritual background, cinematic lighting',
                caption: 'Focus',
                continuityTags: {
                    location: 'abstract void',
                    timeOfDay: 'timeless',
                    dominantColor: 'neutral',
                    heroProp: 'none',
                    wardrobeDetail: 'none'
                }
            }));
        }

        return parsed;
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

        // Target 98% for both directions to stay in the [95%, 100%] sweet spot
        const safetyMargin = 0.98;
        const wordsPerSegment = Math.round((secondsPerSegment - 0.4) * config.speakingRateWps * safetyMargin);
        const hardCapPerSegment = Math.floor((secondsPerSegment - 0.2) * config.speakingRateWps);

        const prompt = `Adjust these segment commentaries to be ${direction}.

Current segments (Count: ${segments.length}):
${JSON.stringify(segments, null, 2)}

Target Duration: ${targetDurationSeconds}s total (~${secondsPerSegment.toFixed(1)}s per segment).

⚠️ WORD COUNT IS CRITICAL ⚠️
Target: ${wordsPerSegment} words per segment (95-98% length)
HARD CAP: ${hardCapPerSegment} words (DO NOT EXCEED 100% length)

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

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ segments?: SegmentContent[] } | SegmentContent[]>(response);

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

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ hooks: string[] }>(response);
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

        const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ captionBody: string; hashtags: string[] | string }>(response);

        let hashtags: string[] = [];
        if (Array.isArray(parsed.hashtags)) {
            hashtags = parsed.hashtags;
        } else if (typeof parsed.hashtags === 'string') {
            hashtags = parsed.hashtags.split(/[\s,]+/).filter((t: string) => t.length > 0);
        }

        hashtags = hashtags
            .map((t: string) => t.startsWith('#') ? t : `#${t}`)
            .filter((t: string) => t !== '#');

        if (hashtags.length === 0) {
            hashtags = ['#ChallengingView', '#spirituality', '#reels', '#growth', '#selfawareness', '#mentalhealth', '#selfinquiry', '#shadowwork', '#psychology', '#mindset'];
        }

        return {
            captionBody: parsed.captionBody || 'New reel ready!',
            hashtags
        };
    }

    /**
     * Enforces hard word limits on commentaries by truncating at sentence boundaries.
     */
    private enforceWordLimits(segments: SegmentContent[], maxWords: number): SegmentContent[] {
        return segments.map((segment, index) => {
            const words = segment.commentary.trim().split(/\s+/).filter(w => w.length > 0);
            if (words.length <= maxWords) {
                return segment;
            }

            console.warn(
                `[LLM] Segment ${index + 1} exceeded word limit: ${words.length} > ${maxWords}. Truncating...`
            );

            // Try to truncate at sentence boundary
            const truncatedWords = words.slice(0, maxWords);
            let commentary = truncatedWords.join(' ');

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
    private normalizeSegments(data: unknown): SegmentContent[] {
        if (!data || typeof data !== 'object') {
            throw new Error(`LLM returned invalid segments format: ${JSON.stringify(data)}`);
        }

        // Already an array
        if (Array.isArray(data)) {
            return data as SegmentContent[];
        }

        return this.tryUnwrapSegments(data as Record<string, unknown>);
    }

    /**
     * Attempts to extract segments from various object formats.
     */
    private tryUnwrapSegments(data: Record<string, unknown>): SegmentContent[] {
        // Object with 'segments' field
        if (Array.isArray(data.segments)) {
            return data.segments as SegmentContent[];
        }

        // Single object wrap
        if ('commentary' in data && 'imagePrompt' in data) {
            return [data as unknown as SegmentContent];
        }

        // Numeric keys extracted from object values
        const values = Object.values(data);
        if (values.length > 0 && this.isSegmentObject(values[0])) {
            return values as unknown as SegmentContent[];
        }

        throw new Error(`LLM returned invalid segments format: ${JSON.stringify(data).substring(0, 200)}`);
    }

    /**
     * Simple check if an unknown object matches the SegmentContent shape.
     */
    private isSegmentObject(obj: unknown): boolean {
        const o = obj as Record<string, unknown>;
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'commentary' in o &&
            'imagePrompt' in o
        );
    }
}
