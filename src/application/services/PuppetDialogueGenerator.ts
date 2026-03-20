import { ILlmClient } from '../../domain/ports/ILlmClient';

export interface PuppetDialogueTurn {
    speaker: 'marco' | 'luna';
    line: string;
}

export interface PuppetDialogueResult {
    hook: string;
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
            ? `CRITICAL: The user provided exact dialogue. Use their text word-for-word, splitting it between Marco and Luna as a conversation. Only generate the hook/scene/visual prompt.\n\nEXACT TEXT: """${providedCommentary}"""`
            : `Write a SHORT, EXPLOSIVE 2-character dialogue for Instagram Reels / YouTube Shorts. This must feel like catching a REAL ARGUMENT in progress.

AUDIENCE: European Gen Y/Z (18-32), English as second language. They watch @stoiccole, @TheIntrovertedAttorney. They live in the world of situationships, hypergamy debates, body count wars, and broken monogamy.

CHARACTERS:
- Marco (guy, late 20s): Direct, blunt, doesn't sugarcoat. Says uncomfortable truths. Goes quiet when he's hurt. Uses simple words that hit hard.
- Luna (girl, late 20s): Sharp, emotional, calls out hypocrisy. When hurt, gets cold. Not afraid to say the hardest thing in the room.

THE HOOK (MOST IMPORTANT PART):
- Generate a "hook" — this is the FIRST FRAME TEXT that viewers see while scrolling. It must make them STOP.
- 4-8 words MAX. Bold, provocative, specific.
- Use one of these formats:
  • Negative Warning: "Stop doing X if you want Y" / "The 1 text that proves X"
  • Scenario Setup: "POV: [specific situation]" / "Dating in 2026 be like…"
  • Contrarian: "Unpopular opinion: X is actually Y"
  • Curiosity Gap: Use 2026 dating terms (delusionship, clear-coding, orbiting, breadcrumbing, beige flags)
- Examples of GREAT hooks: "The 1 text that proves you're just a situationship." / "He said body count doesn't matter. Then he asked this..." / "Why 'matching their energy' is destroying your dating life."

DIALOGUE RULES:
- 5 to 7 turns ONLY. This is a ~45 second scene. 100-130 words TOTAL.
- START IN MEDIA RES — mid-argument. NO greetings, no setup, no "hey can we talk."
- Each line: MAX 8-10 words. Simple B1-B2 English. Short, sharp.
- END WITH AN OPEN DEBATE QUESTION OR UNCOMFORTABLE TRUTH. Never resolve the conflict. Leave viewers arguing in comments.
- Show feelings through SPECIFIC MOMENTS, not clever words.
- BAD: "Your emotional architecture is fundamentally incompatible."
- GOOD: "You said you loved me. Then you stopped calling."
- Use 2026 dating vocabulary naturally: situationship, body count, high value, orbiting, breadcrumbing, clear-coding, delusionship.
- Zero philosophy. Zero quotes. If a line sounds smart, delete it and write something that sounds like a REAL fight.

EMOTION CUES — add parenthetical stage directions before some lines:
- "(cold) That's not what I asked."
- "(quiet) ...forget it."
- These are metadata — removed before voice reads the line.

EXAMPLE OF VIRAL DIALOGUE:
Hook: "He said body count doesn't matter. Then he asked this..."
Marco: "So how many guys before me?"
Luna: "(cold) Why does it matter?"
Marco: "It doesn't. I'm just asking."
Luna: "Then why do you look like that?"
Marco: "Like what?"
Luna: "Like you already decided the answer is too high."
Marco: "(quiet) ...because it is."
[END — no resolution]

^ Every line is simple. Specific. Hurts. Triggers comments.

USER'S SCENARIO: """${userInput}"""`

        const prompt = `${strictEnforcement}

Generate a dialogue scene matching this JSON schema. Output MUST be valid JSON only.

Rules:
- 5 to 7 turns of dialogue (alternating Marco and Luna). This is a ~45 second scene.
- Each line: 1 short sentence. Max 8-10 words. Simple English.
- CRITICAL: Do NOT censor or asterisk-mask ANY words. Write words fully. Use simple euphemisms if needed.
- hook: THE FIRST-FRAME TEXT. 4-8 words. Bold, provocative, specific. This is what makes people STOP scrolling.
- scene: One-line setting description (e.g. "Late night. Empty parking lot. His car, her standing outside.")
- visualPrompt: A detailed, photorealistic prompt for the background image (9:16 vertical, cinematic lighting, moody atmosphere). NO TEXT, NO PEOPLE in the image.
- caption: Short Instagram caption — polarizing + emoji + debate CTA + 3-5 hashtags. Example: "Marco just exposed the 2026 dating game 😭 Who's right? 👇 #DatingIn2026 #Situationship #ModernDating"

JSON Schema:
{
  "hook": "...",
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
