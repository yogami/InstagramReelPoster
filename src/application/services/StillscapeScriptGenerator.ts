import { ILlmClient } from '../../domain/ports/ILlmClient';
import { StillscapeAct } from '../../lib/product-demo/domain/services/SovereignStillscapeEngine';

export interface StillscapeScriptResult {
    caption: string;
    acts: StillscapeAct[];
}

export class StillscapeScriptGenerator {
    constructor(private readonly llmClient: ILlmClient) {}

    /**
     * Generates a 5-Act Stillscape script from a user's transcript.
     * If `providedCommentary` is provided (e.g., from an "use this exact phrasing" instruction),
     * the LLM is strictly instructed to use the provided commentary verbatim and only
     * split it logically into acts while generating appropriate visual prompts and typography.
     */
    async generateScript(transcript: string, providedCommentary?: string): Promise<StillscapeScriptResult> {
        const strictEnforcement = providedCommentary 
            ? `CRITICAL ENFORCEMENT: The user has provided an EXACT text they want narrated. You MUST use the exact phrase provided below, word-for-word, without hallucinating, summarizing, or changing any words. Your ONLY job is to split their exact transcription logically across the 5 'narration' keys and synthesize visual prompts based on its theme.\n\nEXACT NARRATION TEXT: """${providedCommentary}"""`
            : `You are a master script writer. The user has provided a transcription of their thoughts. Reformulate their input into a profound, hard-hitting, low-energy philosophical 5-Act script exploring the harsh truths or deep realisations related to their input.\n\nUSER INPUT: """${transcript}"""`;

        const prompt = `${strictEnforcement}

Generate a 5-Act Structure matching the following JSON schema. The output MUST be valid JSON.
For each act:
- 'id': act1, act2, act3, act4, act5
- 'narration': The spoken script (1-2 sentences max). Use '...' for pauses.
- 'visualPrompt': A highly detailed, photorealistic, cinematic prompt for image generation (8k, moody, surreal, or literal depending on theme). DO NOT INCLUDE ANY TEXT IN THE VISUAL PROMPT.
- 'typography': Exact wording to flash on screen (max 2 words per object). One 'white', one 'yellow'.

JSON Schema:
{
  "caption": "A concise, provocative Instagram caption containing insights from the text, ending with 3-5 relevant hashtags.",
  "acts": [
    {
      "id": "act1",
      "narration": "...",
      "visualPrompt": "...",
      "typography": [
        {"text": "WORD", "color": "white"},
        {"text": "HIGHLIGHT", "color": "yellow"}
      ]
    },
    ... (must have exactly 5 acts)
  ]
}`;

        const systemPrompt = "You are the Kova script synthesis engine. You return strictly valid JSON. No markdown wrappers. Just raw JSON.";
        
        const maxRetries = 4;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                console.log(`[StillscapeScriptGenerator] Requesting LLM synthesis (attempt ${attempt + 1}/${maxRetries})...`);
                const responseText = await this.llmClient.generateText(prompt);
                
                // Basic JSON cleanup if the LLM wrapped it in markdown
                let cleanJson = responseText.trim();
                if (cleanJson.startsWith('```json')) cleanJson = cleanJson.substring(7);
                else if (cleanJson.startsWith('```')) cleanJson = cleanJson.substring(3);
                if (cleanJson.endsWith('```')) cleanJson = cleanJson.substring(0, cleanJson.length - 3);
                
                const parsed = JSON.parse(cleanJson.trim()) as StillscapeScriptResult;
                
                if (!parsed.acts || parsed.acts.length === 0) {
                    throw new Error("LLM returned an invalid empty acts array.");
                }
                
                return parsed;
            } catch (error) {
                const errMsg = error instanceof Error ? error.message : String(error);
                const is429 = errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('Too Many Requests');
                
                if (is429 && attempt < maxRetries - 1) {
                    // Extract retry delay from error message if available; default to 60s
                    const retryMatch = errMsg.match(/retry(?:Delay)?['":\s]+(?:["']?)?(\d+)/i);
                    const waitSeconds = retryMatch ? parseInt(retryMatch[1]) + 5 : 65;
                    console.warn(`[StillscapeScriptGenerator] Rate limited (429). Waiting ${waitSeconds}s before retry ${attempt + 2}/${maxRetries}...`);
                    await new Promise(resolve => setTimeout(resolve, waitSeconds * 1000));
                    continue;
                }
                
                console.error("[StillscapeScriptGenerator] Failed to generate script:", error);
                throw new Error(`Script generation failed: ${errMsg}`);
            }
        }
        
        throw new Error("Script generation failed after all retries.");
    }
}
