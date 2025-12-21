/**
 * OpenAI LinkedIn Draft Service
 * 
 * Generates LinkedIn post drafts using GPT with the user's specific tone.
 * AC4: OpenAI LinkedIn Draft Generator
 */

import axios from 'axios';
import { ILinkedInDraftService } from '../../domain/ports/ILinkedInDraftService';
import { LinkedInDraftContent } from '../../domain/entities/LinkedInDraft';

export class OpenAILinkedInDraftService implements ILinkedInDraftService {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(
        apiKey: string,
        model: string = 'gpt-4.1',
        baseUrl: string = 'https://api.openai.com'
    ) {
        if (!apiKey) {
            throw new Error('OpenAI API key is required');
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

PERSONA:
- Building AI-powered tools for content automation
- Looking for like-minded collaborators and partnerships
- Blends technical expertise with spiritual/psychological depth
- Speaks from experience, not theory

OBJECTIVES FOR LINKEDIN:
- MAXIMIZE OUTREACH and discoverability
- Market expertise in AI product development
- Attract potential collaborators and co-builders
- Share insights on solopreneurship, automation, and conscious building
- Stand out from generic "hustle culture" content

CONSTRAINTS:
- Tone: honest, sharp, builder-mindset, technically grounded but spiritually aware
- Include 3-5 strategic hashtags for discoverability (AI, solopreneurship, automation, tech)
- No "as an AI" language
- Keep language simple and clear (roughly 8th-grade readability)
- Output must be short enough to read in a glance
- Every post should subtly position expertise without being salesy`
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.7,
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
        return `Raw note from a solopreneur building AI products (voice-to-text or short text about AI, automation, solopreneurship, spirituality, or founder psychology):

"""
${rawNote}
"""

Your tasks:

1. Extract the core tension in 1–2 sentences (what problem or uncomfortable truth is being pointed at, relevant to builders/founders/AI practitioners).

2. Generate one LinkedIn hook line (max 18–20 words) that could be the first line of a post. It should:
   - Be scroll-stopping and specific
   - Work in a tech founder / AI builder / solopreneur context
   - Subtly position the author as someone building real things

3. Propose a post outline with 3–5 bullet points the user can expand in their own words. Each bullet should be:
   - A sharp idea, not a full paragraph
   - Relevant to AI, automation, solopreneurship, or conscious building
   - Written to attract like-minded collaborators

4. Suggest 1–2 closing angles (short sentence ideas) to wrap the post:
   - Could be a reflective question, a challenge, or a collaboration invite
   - Should encourage engagement from potential collaborators

5. Generate 3-5 strategic HASHTAGS for LinkedIn discoverability:
   - Focus on: AI, automation, solopreneurship, tech, entrepreneurship
   - Use popular LinkedIn hashtags that reach your target audience
   - Format: #AIautomation, #solopreneur, etc.

Return ONLY a JSON object:
{
  "core_tension": "<1–2 sentences>",
  "hook": "<single LinkedIn first line, max 18-20 words>",
  "outline_bullets": [
    "<bullet 1>",
    "<bullet 2>",
    "<bullet 3>"
  ],
  "closer_options": [
    "<closing idea 1>",
    "<closing idea 2>"
  ],
  "hashtags": [
    "#hashtag1",
    "#hashtag2",
    "#hashtag3"
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
