/**
 * OpenRouterTextClient — LLM client using OpenRouter's OpenAI-compatible API.
 * Features multi-model fallback: cycles through free models when one is rate-limited.
 */
export class OpenRouterTextClient {
    private readonly apiKey: string;
    private readonly models: string[];
    private readonly baseUrl = 'https://openrouter.ai/api/v1/chat/completions';

    /** Models ranked by reliability for dialogue JSON generation.
     *  Paid models first (sub-penny costs), free as fallback */
    private static readonly FALLBACK_CHAIN = [
        // Paid — cheap and reliable for structured JSON ($0.0003/M tokens)
        'deepseek/deepseek-v3.2',
        'deepseek/deepseek-chat-v3.1',
        'google/gemma-3-27b-it',
        // Free fallbacks
        'google/gemma-3-27b-it:free',
        'meta-llama/llama-3.3-70b-instruct:free',
        'qwen/qwen3-coder:free',
        'mistralai/mistral-small-3.1-24b-instruct:free',
    ];

    constructor(apiKey: string, model?: string) {
        this.apiKey = apiKey;
        // Put the preferred model first, then append all others
        if (model) {
            this.models = [model, ...OpenRouterTextClient.FALLBACK_CHAIN.filter(m => m !== model)];
        } else {
            this.models = [...OpenRouterTextClient.FALLBACK_CHAIN];
        }
    }

    async generateText(prompt: string): Promise<string> {
        let lastError: Error | null = null;

        for (const model of this.models) {
            try {
                console.log(`[OpenRouter] Trying model: ${model}`);
                const response = await fetch(this.baseUrl, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'https://poster-service.run.app',
                        'X-Title': 'InstagramReelPoster',
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: [{ role: 'user', content: prompt }],
                        temperature: 0.8,
                        max_tokens: 4096,
                    }),
                });

                if (response.status === 429) {
                    const errText = await response.text();
                    console.warn(`[OpenRouter] ${model} rate-limited (429). Trying next model...`);
                    lastError = new Error(`429: ${errText}`);
                    continue;
                }

                if (!response.ok) {
                    const errText = await response.text();
                    console.warn(`[OpenRouter] ${model} error ${response.status}. Trying next model...`);
                    lastError = new Error(`OpenRouter API error ${response.status}: ${errText}`);
                    continue;
                }

                const data = await response.json() as any;
                const content = data.choices?.[0]?.message?.content || '';
                if (content) {
                    console.log(`[OpenRouter] ✅ ${model} responded successfully`);
                    return content;
                }

                console.warn(`[OpenRouter] ${model} returned empty content. Trying next...`);
                lastError = new Error('Empty response');
                continue;
            } catch (err: any) {
                console.warn(`[OpenRouter] ${model} failed: ${err.message}. Trying next...`);
                lastError = err;
                continue;
            }
        }

        throw lastError || new Error('All OpenRouter models failed');
    }
}
