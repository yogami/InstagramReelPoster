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
            : `Transform the user's random thought into a deep, cinematic 2-character dialogue. Marco is introspective and quietly honest. Luna challenges his ideas but also reveals her own vulnerability. The dialogue should feel like a scene from a film — emotionally raw, with pauses and subtext. Use SIMPLE words. No philosophical jargon — just two real people talking about something that matters to them.\n\nUSER'S THOUGHT: """${userInput}"""`;

        const prompt = `${strictEnforcement}

Generate a dialogue scene matching this JSON schema. Output MUST be valid JSON only.

Rules:
- 10 to 14 turns of dialogue (alternating Marco and Luna). This is a ~1 minute conversation.
- Each line: 1-2 sentences max. Natural speech with pauses ("...") and emotion.
- Keep it raw and honest — like two people in a late-night conversation, NOT a TED talk.
- CRITICAL: Do NOT censor or asterisk-mask ANY words. This dialogue will be read aloud by text-to-speech. Asterisks will be spoken literally. Instead of censoring, use natural euphemisms: "intimacy" instead of "sex", "being together" instead of "sleeping together", "desire" instead of "lust", etc. Write the words fully — no s*x, f**k, sh*t or any masked words.
- scene: A one-line description of the setting (e.g. "Two friends at a dimly lit café, late at night")
- visualPrompt: A detailed, photorealistic prompt for the background image (9:16 vertical, cinematic, moody). NO TEXT in the image.
- caption: A provocative Instagram caption with 3-5 hashtags.

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
