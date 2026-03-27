import { GoogleGenerativeAI } from '@google/generative-ai';
import { ILinkedInDraftService } from '../../domain/ports/ILinkedInDraftService';
import { LinkedInDraftContent } from '../../domain/entities/LinkedInDraft';

/**
 * Gemini-based LinkedIn draft generation.
 * Eliminates OpenAI costs.
 */
export class GeminiLinkedInDraftService implements ILinkedInDraftService {
    private readonly genAI: GoogleGenerativeAI;
    private readonly modelName: string;

    constructor(apiKey: string, modelName: string = 'gemini-1.5-flash') {
        if (!apiKey) {
            throw new Error('Google API key is required for LinkedIn drafts');
        }
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.modelName = modelName;
    }

    async generateDraftContent(rawNote: string): Promise<LinkedInDraftContent> {
        const prompt = this.buildPrompt(rawNote);
        const model = this.genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: { responseMimeType: 'application/json' }
        });

        const systemInstruction = `You are helping write personal LinkedIn posts for a SOLOPRENEUR who builds AI products and automated content creation solutions.
Your goal is to maximize VIRAL potential and ENGAGEMENT.

PERSONA:
- Building AI-powered tools for content automation (e.g., automated reels, LinkedIn posters)
- Blends technical expertise with spiritual/psychological depth ("Challenging View" brand)
- Speaks from experience, not theory. Honest, sharp, and slightly provocative.

LINKEDIN VIRAL STRATEGY:
1. THE HOOK: The first line is everything. It must be a "scroll-stopper". Use a strong opinion, a surprising stat, or a relatable pain point.
2. WHITE SPACE ("BROETRY"): Use lots of line breaks. One sentence per line for the first 3 lines to trigger the "See more" button.
3. NO FLUFF: No "I'm excited to share", "I'm humbled to announce". Start mid-action.
4. ENGAGEMENT: Close with a SPECIFIC, easy-to-answer question that sparks a conversation in the comments.
5. HASHTAGS: Use a mix of 3 broad and 2 niche tags.

Return ONLY a JSON object with fields: core_tension, hook, outline_bullets (array), closer_options (array), hashtags (array).`;

        const result = await model.generateContent([
            { text: systemInstruction },
            { text: prompt }
        ]);

        const responseText = result.response.text();
        return this.parseResponse(responseText);
    }

    private buildPrompt(rawNote: string): string {
        return `Raw note from a solopreneur building AI products:
"""
${rawNote}
"""

Extract core tension, generate a viral hook, outline 3-5 sharp ideas, and provide 1-2 engagement closers. Respond only with JSON.`;
    }

    private parseResponse(content: string): LinkedInDraftContent {
        try {
            const parsed = JSON.parse(content);
            return {
                core_tension: parsed.core_tension || '',
                hook: parsed.hook || '',
                outline_bullets: parsed.outline_bullets || [],
                closer_options: parsed.closer_options || [],
                hashtags: parsed.hashtags || [],
            };
        } catch (error) {
            throw new Error(`Failed to parse Gemini LinkedIn draft response: ${error}`);
        }
    }
}
