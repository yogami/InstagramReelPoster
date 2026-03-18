import { ILlmClient } from '../../domain/ports/ILlmClient';

export interface PuppetDialogueTurn {
    speaker: 'marco' | 'luna';
    line: string;
}

export interface PuppetDialogueResult {
    caption: string;
    scene: string;
    visualPrompt: string;
    turns: PuppetDialogueTurn[];
}

export class PuppetDialogueGenerator {
    constructor(private readonly llmClient: ILlmClient) {}

    /**
     * Converts a user's random thought/topic into a 2-character philosophical dialogue.
     * Characters: Marco (male, introspective) and Luna (female, challenging/grounding).
     */
    async generateDialogue(userInput: string, providedCommentary?: string): Promise<PuppetDialogueResult> {
        const strictEnforcement = providedCommentary
            ? `CRITICAL: The user provided exact dialogue. Use their text word-for-word, splitting it between Marco and Luna as a conversation. Only generate the scene/visual prompt.\n\nEXACT TEXT: """${providedCommentary}"""`
            : `Transform the user's thought into a DRAMATIC 2-character dialogue for Instagram Reels. Target audience: Gen Y/Z (18-32).

CHARACTERS — they communicate DIFFERENTLY:
- Marco (late 20s, male): Thinks in LOGIC. Deflects emotion with reasoning. When Luna gets emotional, he tries to "solve" it instead of feeling it. Uses humor to avoid vulnerability. When cornered, goes quiet or says something accidentally honest that surprises even him. His lines should feel like he's building walls in real-time.
- Luna (late 20s, female): Thinks in FEELING. Communicates through subtext — what she doesn't say matters more than what she does. Asks loaded questions she already knows the answer to. Uses silence as a weapon. When she's hurt, she gets sharper, not softer. Her lines should feel like she's testing him and he keeps failing.

TENSION RULES — every line must either BUILD or RELEASE tension:
- This is a SCENE, not a discussion. Think Netflix drama, not podcast.
- Luna says things that sound casual but are loaded with subtext: "Oh, so you DO notice things about me" (meaning: you never pay attention)
- Marco says things that sound logical but reveal insecurity: "I'm just saying, statistically..." (meaning: I'm terrified)
- Include DRAMATIC BEATS: one of them says something that lands like a punch. The other goes quiet. Then pivots.
- CONFLICT is the engine. They want different things. They misread each other. They almost connect, then one of them ruins it.
- Flirting should feel like a power play — who blinks first, who shows their hand.
- End UNRESOLVED — no hugs, no lessons, no "maybe we should talk about this." Just the weight of what was said hanging in the air.
- ZERO philosophy. ZERO wisdom. ZERO life lessons. If it sounds like a quote, DELETE IT.

USER'S THOUGHT: """${userInput}"""`;

        const prompt = `${strictEnforcement}

Generate a dialogue scene matching this JSON schema. Output MUST be valid JSON only.

Rules:
- 10 to 14 turns of dialogue (alternating Marco and Luna). This is a ~1 minute scene.
- Each line: 1-2 sentences max. Messy, real speech. Pauses ("..."), trail-offs, loaded silences.
- ARC: playful/flirty → tension builds → someone says something too real → the other retreats → ends unresolved
- CRITICAL: Do NOT censor or asterisk-mask ANY words. This is read by text-to-speech — asterisks get spoken literally. Use euphemisms: "intimacy" not "sex", "hooking up" not explicit terms. Write words fully.
- scene: One-line setting description matching the content (e.g. "A crowded rooftop party, bass thumping, city skyline behind them")
- visualPrompt: A detailed, photorealistic prompt for the background image (9:16 vertical, cinematic lighting, moody atmosphere). The scene should MATCH the dialogue situation. NO TEXT in the image.
- caption: A short, punchy Instagram caption that makes you stop scrolling. Max 1-2 sentences + 3-5 hashtags.

JSON Schema:
{
  "caption": "...",
  "scene": "...",
  "visualPrompt": "...",
  "turns": [
    { "speaker": "marco", "line": "..." },
    { "speaker": "luna", "line": "..." }
  ]
}`;

        const maxRetries = 4;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[PuppetDialogueGenerator] Requesting LLM synthesis (attempt ${attempt + 1}/${maxRetries})...`);
                const responseText = await this.llmClient.generateText(prompt);

                let cleanJson = responseText.trim();
                if (cleanJson.startsWith('```json')) cleanJson = cleanJson.substring(7);
                else if (cleanJson.startsWith('```')) cleanJson = cleanJson.substring(3);
                if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);

                const parsed = JSON.parse(cleanJson.trim()) as PuppetDialogueResult;

                if (!parsed.turns || parsed.turns.length < 2) {
                    throw new Error("LLM returned fewer than 2 dialogue turns.");
                }

                // Validate speakers and sanitize for TTS
                for (const turn of parsed.turns) {
                    if (turn.speaker !== 'marco' && turn.speaker !== 'luna') {
                        turn.speaker = turn.speaker === 'guy' ? 'marco' : 'luna';
                    }
                    turn.line = this.sanitizeForTTS(turn.line);
                }

                return parsed;
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests');

                if (is429 && attempt < maxRetries - 1) {
                    const retryMatch = errMsg.match(/retry(?:Delay)?['"\s:]+(?:["']?)?(\d+)/i);
                    const waitSeconds = retryMatch ? parseInt(retryMatch[1]) + 5 : 65;
                    console.warn(`[PuppetDialogueGenerator] Rate limited. Waiting ${waitSeconds}s...`);
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                    continue;
                }

                console.error("[PuppetDialogueGenerator] Failed:", error);
                throw new Error(`Dialogue generation failed: ${errMsg}`);
            }
        }

        throw new Error("Dialogue generation failed after all retries.");
    }

    /**
     * Replaces asterisk-censored words with natural euphemisms
     * so TTS doesn't read out "asterisk" literally.
     */
    private sanitizeForTTS(text: string): string {
        let sanitized = text;
        // Replace censored words with euphemisms (order matters)
        sanitized = sanitized.replace(/f\*\*king/gi, 'freaking');
        sanitized = sanitized.replace(/f\*\*ked/gi, 'freaked');
        sanitized = sanitized.replace(/f\*\*k/gi, 'freak');
        sanitized = sanitized.replace(/s\*x(ual|uality)?/gi, 'intimacy');
        sanitized = sanitized.replace(/sh\*t/gi, 'crap');
        sanitized = sanitized.replace(/b\*tch/gi, 'witch');
        sanitized = sanitized.replace(/d\*ck/gi, 'jerk');
        sanitized = sanitized.replace(/a\*\*/gi, 'butt');
        sanitized = sanitized.replace(/h\*rny/gi, 'turned on');
        sanitized = sanitized.replace(/p\*rn/gi, 'adult content');
        sanitized = sanitized.replace(/\*+/g, '');  // Remove stray asterisks
        return sanitized;
    }
}
