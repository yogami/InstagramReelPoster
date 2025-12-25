import axios from 'axios';

export class OpenAIService {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;

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

    /**
     * Executes a chat completion request with retries and error handling.
     */
    async chatCompletion(
        prompt: string,
        systemPrompt: string,
        options: {
            jsonMode?: boolean;
            temperature?: number;
            maxRetries?: number;
        } = {}
    ): Promise<string> {
        const { jsonMode = false, temperature = 0.7, maxRetries = 3 } = options;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.executeRequest(prompt, systemPrompt, temperature, jsonMode);
            } catch (error) {
                if (await this.handleError(error, attempt, maxRetries)) {
                    continue;
                }
                throw error;
            }
        }

        throw new Error('OpenAI call failed after max retries');
    }

    private async executeRequest(
        prompt: string,
        systemPrompt: string,
        temperature: number,
        jsonMode: boolean
    ): Promise<string> {
        const response = await axios.post(
            `${this.baseUrl}/v1/chat/completions`,
            {
                model: this.model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt },
                ],
                temperature: temperature,
                ...(jsonMode && { response_format: { type: 'json_object' } }),
            },
            {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        return response.data.choices[0].message.content;
    }

    private async handleError(error: unknown, attempt: number, maxRetries: number): Promise<boolean> {
        if (!axios.isAxiosError(error)) {
            return false;
        }

        const status = error.response?.status;
        const message = error.response?.data?.error?.message || error.message;

        if (this.shouldRetry(status, attempt, maxRetries)) {
            const delay = Math.pow(2, attempt) * 1000;
            console.warn(`[OpenAIService] Transient error (${status}), retrying in ${delay / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return true;
        }

        throw new Error(`OpenAI call failed: ${message}`);
    }

    private shouldRetry(status: number | undefined, attempt: number, maxRetries: number): boolean {
        return (status === 502 || status === 503 || status === 429) && attempt < maxRetries - 1;
    }

    /**
     * Parses a JSON response from the LLM, handling potential markdown code blocks.
     */
    parseJSON<T>(response: string): T {
        try {
            const jsonStr = response.replace(/```json\n?|\n?```/g, '').trim();
            return JSON.parse(jsonStr);
        } catch {
            throw new Error(`Failed to parse LLM response as JSON: ${response.substring(0, 200)}...`);
        }
    }
}
