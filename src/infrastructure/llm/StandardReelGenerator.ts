import {
    ReelPlan,
    SegmentContent,
    PlanningConstraints,
} from '../../domain/ports/ILlmClient';
import { CaptionAndTags } from '../../domain/entities/Growth';
import { getConfig } from '../../config';
import { GptService } from './GptService';
import {
    CHALLENGING_VIEW_SYSTEM_PROMPT,
    PLAN_REEL_PROMPT,
    GENERATE_COMMENTARY_PROMPT,
    GENERATE_SINGLE_SEGMENT_PROMPT,
    GENERATE_VISUALS_FROM_COMMENTARY_PROMPT,
} from './Prompts';

/**
 * Handles generation of standard (image-based) reel content.
 */
export class StandardReelGenerator {
    private readonly openAI: GptService;

    constructor(openAI: GptService) {
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

        // Enforce segment count based on either LLM's chosen duration or the midpoint
        // This ensures consistent pacing (~5s/segment)
        if (!plan.targetDurationSeconds) {
            plan.targetDurationSeconds = (constraints.minDurationSeconds + constraints.maxDurationSeconds) / 2;
        }

        // Defensive: Ensure LLM chosen duration respects constraints before calculating segments
        if (plan.targetDurationSeconds < constraints.minDurationSeconds) plan.targetDurationSeconds = constraints.minDurationSeconds;
        if (plan.targetDurationSeconds > constraints.maxDurationSeconds) plan.targetDurationSeconds = constraints.maxDurationSeconds;

        const enforcedSegmentCount = Math.round(plan.targetDurationSeconds / 5);
        if (plan.segmentCount !== enforcedSegmentCount) {
            console.log(`[ReelPlan] Overriding LLM segment count ${plan.segmentCount} with calculated ${enforcedSegmentCount}`);
            plan.segmentCount = enforcedSegmentCount;
        }

        // Safety CLAMP on segment count
        if (plan.segmentCount < 2) plan.segmentCount = 2;
        if (plan.segmentCount > 15) plan.segmentCount = 15;

        // FLUX Optimization: Extract zoomSequence or zoomType with fallback
        if (!plan.zoomSequence || plan.zoomSequence.length === 0) {
            // Fallback to zoomType if present, or generate a sequence based on it
            if (plan.zoomType === 'static') {
                plan.zoomSequence = Array(plan.segmentCount).fill('static');
            } else if (plan.zoomType === 'alternating' || plan.zoomType === 'ken_burns') {
                plan.zoomSequence = Array(plan.segmentCount).fill(null).map((_, i) => i % 2 === 0 ? 'slow_zoom_in' : 'slow_zoom_out');
            } else {
                // Default to slow_zoom_in for visual energy
                plan.zoomSequence = Array(plan.segmentCount).fill(plan.zoomType || 'slow_zoom_in');
            }
        }

        // Ensure zoomSequence matches segment count (truncate or extend if needed)
        if (plan.zoomSequence.length < plan.segmentCount) {
            const filler = plan.zoomSequence[plan.zoomSequence.length - 1] || 'slow_zoom_in';
            while (plan.zoomSequence.length < plan.segmentCount) {
                plan.zoomSequence.push(filler);
            }
        } else if (plan.zoomSequence.length > plan.segmentCount) {
            plan.zoomSequence = plan.zoomSequence.slice(0, plan.segmentCount);
        }

        console.log(`[ReelPlan] Targeted ${plan.targetDurationSeconds}s with ${plan.segmentCount} segments. ZoomSequence: ${JSON.stringify(plan.zoomSequence)}`);

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

        console.log(`[StandardReel v1.1] Generating for ${plan.segmentCount} segments (Target: ${wordsPerSegment} words)`);

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
        const results: { commentary: string }[] = [];

        console.log(`[StandardReel] Starting iterative generation for ${plan.segmentCount} segments...`);

        for (let i = 1; i <= plan.segmentCount; i++) {
            const role = this.getSegmentRole(i, plan.segmentCount);
            const previousContext = results.length > 0
                ? results.map((r, idx) => `Segment ${idx + 1}: "${r.commentary}"`).join('\n')
                : 'None yet (this is the first segment).';

            const prompt = GENERATE_SINGLE_SEGMENT_PROMPT
                .replace(/{{currentIndex}}/g, i.toString())
                .replace(/{{totalSegments}}/g, plan.segmentCount.toString())
                .replace('{{summary}}', plan.summary)
                .replace('{{transcript}}', transcript)
                .replace('{{previousCommentaries}}', previousContext)
                .replace('{{segmentRole}}', role)
                .replace(/{{wordsPerSegment}}/g, wordsPerSegment.toString())
                .replace(/{{hardCapPerSegment}}/g, hardCapPerSegment.toString());

            try {
                const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
                const parsed = this.openAI.parseJSON<{ commentary: string }>(response);

                if (!parsed || !parsed.commentary || parsed.commentary.trim().length < 2) {
                    console.warn(`[StandardReel] Segment ${i}: Invalid or empty response, using fallback.`);
                    results.push({ commentary: `${plan.summary} - Part ${i}` });
                } else {
                    results.push({ commentary: parsed.commentary });
                    console.log(`[StandardReel] Generated segment ${i}/${plan.segmentCount}: "${parsed.commentary.substring(0, 50)}..."`);
                }
            } catch (error) {
                console.error(`[StandardReel] Failed to generate segment ${i}:`, error);
                // Push a fallback to maintain segment count
                results.push({ commentary: `Segment ${i} content.` });
            }
        }

        console.log(`[StandardReel] Iterative generation complete: ${results.length} segments`);
        return results;
    }

    private getSegmentRole(index: number, total: number): string {
        if (index === 1) return 'hook';
        if (index === total) return 'payoff';
        return 'body';
    }

    private normalizeCommentaryResponse(data: any): { commentary: string }[] {
        if (!data) return [];

        if (Array.isArray(data)) {
            return data;
        }

        // Try to unwrap common keys
        if (typeof data === 'object') {
            // Case 1: Wrapped arrays
            if (Array.isArray(data.commentaries)) return data.commentaries;
            if (Array.isArray(data.segments)) return data.segments;
            if (Array.isArray(data.script)) return data.script;

            // Case 2: Single object response (The Prod Bug)
            // e.g. { "commentary": "..." }
            if (typeof data.commentary === 'string') {
                return [{ commentary: data.commentary }];
            }

            // Case 3: Find ANY array property
            const arrayValue = Object.values(data).find(val => Array.isArray(val) && val.length > 0);
            if (arrayValue) return arrayValue as { commentary: string }[];
        }

        return [];
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

        try {
            const response = await this.openAI.chatCompletion(prompt, CHALLENGING_VIEW_SYSTEM_PROMPT, { jsonMode: true });
            const data = this.openAI.parseJSON<any>(response);

            let visuals: any[] = [];
            if (Array.isArray(data)) {
                visuals = data;
            } else if (data && typeof data === 'object') {
                visuals = data.visuals || data.segments || data.data || Object.values(data).find(v => Array.isArray(v)) || [];
            }

            if (visuals.length === 0) {
                console.warn('[StandardReel] Visual generation returned empty or invalid structure, using fallback');
                return this.createFallbackVisuals(plan, commentaries);
            }

            // Ensure we have exactly the right count
            if (visuals.length < commentaries.length) {
                const last = visuals[visuals.length - 1];
                while (visuals.length < commentaries.length) visuals.push({ ...last });
            }

            return visuals.slice(0, commentaries.length);
        } catch (error) {
            console.error('[StandardReel] Visual generation failed:', error);
            return this.createFallbackVisuals(plan, commentaries);
        }
    }

    /**
     * Creates meaningful fallback visuals based on the commentary when LLM fails.
     */
    private createFallbackVisuals(plan: ReelPlan, commentaries: { commentary: string }[]): any[] {
        return commentaries.map((c) => {
            // Extract a punchy caption from the commentary (first 7-10 words)
            const words = c.commentary.split(/\s+/).filter(w => w.length > 0);
            const caption = words.slice(0, 7).join(' ').replace(/[.,!?;]$/, '') + (words.length > 7 ? '...' : '');

            return {
                imagePrompt: `${plan.summary}, ${plan.mood} cinematic lighting, high quality photorealistic, 9:16 vertical`,
                caption: caption || 'Insight', // Changed 'Focus' to 'Insight'
                continuityTags: {
                    location: 'cinematic setting',
                    timeOfDay: 'dramatic',
                    dominantColor: 'neutral',
                    heroProp: 'none',
                    wardrobeDetail: 'none'
                }
            };
        });
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
            const words = segment.commentary.trim().split(/\s+/).filter((w: string) => w.length > 0);
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
     * Exposed for resilience testing.
     */
    public normalizeSegments(data: unknown): SegmentContent[] {
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
