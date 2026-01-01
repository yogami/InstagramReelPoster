/**
 * Gpt LinkedIn Draft Service
 * 
 * Generates LinkedIn post drafts using GPT with the user's specific tone.
 * AC4: Gpt LinkedIn Draft Generator
 */

import axios from 'axios';
import { ILinkedInDraftService } from '../../domain/ports/ILinkedInDraftService';
import { LinkedInDraftContent } from '../../domain/entities/LinkedInDraft';

export class GptLinkedInDraftService implements ILinkedInDraftService {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(
        apiKey: string,
        model: string = 'gpt-4.1',
        baseUrl: string = 'https://api.openai.com'
    ) {
        if (!apiKey) {
            throw new Error('Gpt API key is required');
        }
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    async generateDraftContent(rawNote: string): Promise<LinkedInDraftContent> {
        const prompt = this.buildPrompt(rawNote);

        const response = await axios.post(
            `${this.baseUrl}/v1/chat/completions`,
            {
                model: this.model,
                messages: [
                    {
                        role: 'system',
                        content: `You are helping write personal LinkedIn posts for a SOLOPRENEUR who builds AI products and automated content creation solutions.
Your goal is to maximize VIRAL potential and ENGAGEMENT.

PERSONA:
- Building AI-powered tools for content automation (e.g., automated reels, LinkedIn posters)
- Blends technical expertise with spiritual/psychological depth ("Challenging View" brand)
- Speaks from experience, not theory. Honest, sharp, and slightly provocative.

LINKEDIN VIRAL STRATEGY:
1. THE HOOK: The first line is everything. It must be a "scroll-stopper". Use a strong opinion, a surprising stat, or a relatable pain point.
2. WHITE SPACE ("BROETRY"): Use lots of line breaks. One sentence per line for the first 3 lines to trigger the "See more" button.
3. NO FLUFF: No "I'm excited to share", "I'm humbled to announce". Start mid-action.
4. ENGAGEMENT: Close with a SPECIFIC, easy-to-answer question that sparks a conversation in the comments. Not "What do you think?", but "What's the #1 thing you'd automate if you had a magic wand?"
5. HASHTAGS: Use a mix of 3 broad (high volume) and 2 niche tags for optimal discoverability.

CONSTRAINTS:
- No "as an AI" language.
- Keep language simple (8th-grade readability).
- Tone: builder-mindset, technically grounded but spiritually aware.
- Output MUST be a JSON object with the specified fields.`
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.8,
                response_format: { type: 'json_object' },
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const content = response.data.choices[0].message.content;
        return this.parseResponse(content);
    }

    private buildPrompt(rawNote: string): string {
        return `Raw note from a solopreneur building AI products:
"""
${rawNote}
"""

Your tasks:

1. CORE TENSION: Extract the central paradox or uncomfortable truth in 1–2 sentences.

2. VIRAL HOOK: Generate one LinkedIn hook line (max 15 words). 
   - Must be a "Pattern Interrupt" (surprising or challenging).
   - Must make the reader WANT to click "See More".
   - Example: "Hustle culture isn't hard work. It's an avoidance tactic."

3. INSIGHTFUL BULLETS: Propose 3–5 sharp ideas. 
   - Focus on "Value-Add" or "Behind-the-scenes" building.
   - Each bullet should be a single, punchy insight.
   - Use these to expand the author's expertise.

4. ENGAGEMENT CLOSERS: Suggest 1–2 CLOSING QUESTIONS.
   - Must be "Low Friction" (easy to answer in 10 seconds).
   - Focus on sparking an opinion or sharing a personal experience.
   - Example: "What's your biggest bottleneck in building right now?"

5. STRATEGIC HASHTAGS:
   - 3 Broad (e.g., #AI, #Innovation, #Solopreneurship)
   - 2 Niche (e.g., #AIAutomation, #ConsciousBuilding, #FounderPsychology)

Return ONLY a JSON object:
{
  "core_tension": "<1–2 sentences>",
  "hook": "<viral first line>",
  "outline_bullets": [
    "<insight 1>",
    "<insight 2>",
    "<insight 3>"
  ],
  "closer_options": [
    "<engagement question 1>",
    "<engagement question 2>"
  ],
  "hashtags": [
    "#hashtag1",
    "#hashtag2",
    "#hashtag3",
    "#hashtag4",
    "#hashtag5"
  ]
}`;

    }

    private parseResponse(content: string): LinkedInDraftContent {
        try {
            const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
            const parsed = JSON.parse(jsonStr);

            // Validate required fields
            if (!parsed.core_tension || typeof parsed.core_tension !== 'string') {
                throw new Error('Missing or invalid core_tension');
            }
            if (!parsed.hook || typeof parsed.hook !== 'string') {
                throw new Error('Missing or invalid hook');
            }
            if (!Array.isArray(parsed.outline_bullets) || parsed.outline_bullets.length < 3) {
                throw new Error('outline_bullets must be an array with at least 3 items');
            }
            if (!Array.isArray(parsed.closer_options) || parsed.closer_options.length < 1) {
                throw new Error('closer_options must be an array with at least 1 item');
            }

            return {
                core_tension: parsed.core_tension,
                hook: parsed.hook,
                outline_bullets: parsed.outline_bullets,
                closer_options: parsed.closer_options,
                hashtags: parsed.hashtags || [],
            };
        } catch (error) {
            throw new Error(`Failed to parse LinkedIn draft response: ${error}`);
        }
    }
}
