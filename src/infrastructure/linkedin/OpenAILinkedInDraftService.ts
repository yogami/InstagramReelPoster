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
                        content: `You are helping write personal, non-generic LinkedIn posts based on raw thoughts.
Your job is to create a draft skeleton that the user will finish themselves.
It must sound like an opinionated human, not an AI summary.

CONSTRAINTS:
- Tone: honest, sharp, psychologically literate, spiritually grounded, sometimes confronting, never fluffy or corporate
- No emojis, no hashtag list, no "as an AI" language
- Keep language simple and clear (roughly 8th-grade readability)
- Output must be short enough to read in a glance`
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
        return `Raw note from the user (voice-to-text or short text about spirituality, psychology, founders, or creative work):

"""
${rawNote}
"""

Your tasks:

1. Extract the core tension in 1–2 sentences (what problem or uncomfortable truth is being pointed at).

2. Generate one LinkedIn hook line (max 18–20 words) that could be the first line of a post. It should:
   - Be scroll-stopping and specific
   - Work in a professional / founder / spiritual-builder context

3. Propose a post outline with 3–5 bullet points the user can expand in their own words. Each bullet should be:
   - A sharp idea, not a full paragraph
   - Written in an honest, spiritually-aware style

4. Suggest 1–2 closing angles (short sentence ideas) to wrap the post (e.g. a reflective question or a challenge).

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
            };
        } catch (error) {
            throw new Error(`Failed to parse LinkedIn draft response: ${error}`);
        }
    }
}
