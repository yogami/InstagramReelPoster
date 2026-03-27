
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { IChatService } from '../../domain/ports/IChatService';

/**
 * Service for interacting with Google's Gemini API.
 */
export class GeminiService implements IChatService {
    private readonly genAI: GoogleGenerativeAI;
    private readonly model: GenerativeModel;

    constructor(apiKey: string, modelName: string = 'gemini-1.5-pro') {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.model = this.genAI.getGenerativeModel({ model: modelName });
    }

    /**
     * Executes a chat completion request using Gemini.
     */
    async chatCompletion(
        prompt: string,
        systemPrompt: string,
        options?: {
            jsonMode?: boolean;
            temperature?: number;
            maxRetries?: number;
        }
    ): Promise<string> {
        const fullPrompt = `System instructions: ${systemPrompt}\n\nUser request: ${prompt}${options?.jsonMode ? '\n\nIMPORTANT: Respond with VALID JSON ONLY.' : ''
            }`;

        const result = await this.model.generateContent({
            contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
            generationConfig: {
                temperature: options?.temperature ?? 0.7,
                ...(options?.jsonMode && { responseMimeType: 'application/json' }),
            },
        });

        const response = await result.response;
        return response.text();
    }

    /**
     * Parses a JSON response from the LLM.
     */
    parseJSON<T>(response: string): T {
        try {
            // Remove markdown code blocks if present
            const cleanResponse = response.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
            return JSON.parse(cleanResponse) as T;
        } catch (error) {
            console.error('[GeminiService] Failed to parse JSON response:', error);
            console.error('Raw response:', response);
            throw new Error(`Failed to parse LLM response as JSON: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
