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
            : `Write a short, dramatic 2-character dialogue for Instagram Reels. Audience: young Europeans (18-32) who speak English as a SECOND language. Use SIMPLE words. Short sentences. No complex vocabulary.

CHARACTERS:
- Marco (guy, late 20s): Doesn't like talking about feelings. When Luna gets emotional, he tries to fix it or change the subject. Says things like "I don't know what you want from me." Goes quiet when he's hurt.
- Luna (girl, late 20s): Feels everything deeply. Says what she feels directly — no games. When she's hurt, she gets cold. Says things like "You know exactly what you did." Not afraid to say hard truths.

HOW TO WRITE THE DIALOGUE:
- Use SIMPLE English. Think B1-B2 level. No big words. No "statistically" or "recalibrated" or "ecosystem."
- Each line: MAX 8-10 words. People don't give speeches. They say short, sharp things.
- Show feelings through ACTIONS and MEMORIES, not through clever words.
- BAD: "Your emotional vulnerability triggered something primal in me."
- GOOD: "I saw you cry last week. And I felt... nothing. I hate that."
- BAD: "I'm just saying, statistically, people prefer..."
- GOOD: "You said you loved me. Then you stopped calling."
- Light therapy-speak is OK: "you're projecting", "that's your trauma talking", "I need space", "you're deflecting." These are simple and Gen Z uses them. But keep it casual — never academic.

STORY RULES:
- Tell the SPECIFIC STORY from the user's scenario. Invent real moments: names of places, what happened, what someone wore, what time it was.
- BAD: "Effort isn't the point." (too vague — what effort? when?)
- GOOD: "That night at Sara's party. You held my hand in front of everyone. First time."
- The conversation should feel like a REAL FIGHT or a REAL MOMENT between two people. Not a debate. Not a podcast.
- End without resolution. No lessons. No "maybe we should talk." Just silence or someone walking away.
- ZERO philosophy. ZERO quotes. ZERO wisdom. If a line sounds smart, delete it and write something that sounds REAL.

EMOTION CUES — add stage directions in parentheses before some lines to guide how they sound:
- "(sighs) I don't know anymore..."
- "(quiet) ...forget it."
- "(cold) That's not what I asked."
- These cues are metadata — they will be removed before the voice reads the line. Use them to set the emotional tone.

EXAMPLE OF GOOD DIALOGUE (vulnerability topic):
Marco: "You told me to open up. So I did."
Luna: "(quiet) I know."
Marco: "I told you about my dad. About the nights I couldn't sleep."  
Luna: "I remember."
Marco: "So what changed?"
Luna: "(long pause) ...I don't know. I saw you cry in the car. And something in me just... turned off."
Marco: "Turned off."
Luna: "I wanted to hold you. And I also wanted to leave. Both at the same time."
Marco: "(quiet) ...that's messed up."
Luna: "I know. I hate it."

^ THIS is the quality and simplicity we need. Every line is simple. Every line is specific. Every line hurts.

USER'S SCENARIO: """${userInput}"""`

        const prompt = `${strictEnforcement}

Generate a dialogue scene matching this JSON schema. Output MUST be valid JSON only.

Rules:
- 10 to 12 turns of dialogue (alternating Marco and Luna). This is a ~45 second scene.
- Each line: 1 short sentence. Max 8-10 words. Simple English.
- CRITICAL: Do NOT censor or asterisk-mask ANY words. This is read by text-to-speech — asterisks get spoken literally. Use simple words: "being close" not explicit terms. Write words fully.
- scene: One-line setting description matching the content (e.g. "Late night. Empty parking lot. His car, her standing outside.")
- visualPrompt: A detailed, photorealistic prompt for the background image (9:16 vertical, cinematic lighting, moody atmosphere). The scene should MATCH the dialogue situation. NO TEXT in the image.
- caption: A short Instagram caption — simple, emotional, relatable. Max 1 sentence + 3-5 hashtags.

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
        // Strip emotion stage directions — these are metadata for writing style, not narration
        // Matches: (sighs), (softly), (goes quiet, then abruptly), (looks up, her expression unreadable), etc.
        sanitized = sanitized.replace(/\([^)]+\)\s*/g, '');
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
