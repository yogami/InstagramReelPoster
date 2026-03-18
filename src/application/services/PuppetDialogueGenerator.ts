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
            : `Transform the user's random thought into a profound, cinematic 2-character dialogue. Marco is introspective and philosophical. Luna challenges his ideas and grounds them in reality. The dialogue should feel like a scene from a film — emotionally charged, with pauses and subtext.\n\nUSER'S THOUGHT: """${userInput}"""`;

        const prompt = `${strictEnforcement}

Generate a dialogue scene matching this JSON schema. Output MUST be valid JSON only.

Rules:
- 4 to 6 turns of dialogue (alternating Marco and Luna)
- Each line: 1-2 sentences max. Natural speech with pauses ("...") and emotion.
- scene: A one-line description of the setting (e.g. "Two friends on a rooftop at sunset")
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

                // Validate speakers
                for (const turn of parsed.turns) {
                    if (turn.speaker !== 'marco' && turn.speaker !== 'luna') {
                        turn.speaker = turn.speaker === 'guy' ? 'marco' : 'luna';
                    }
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
}
