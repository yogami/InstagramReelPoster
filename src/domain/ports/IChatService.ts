
/**
 * Port for Chat Completion services (LLM).
 */
export interface IChatService {
    /**
     * Executes a chat completion request.
     */
    chatCompletion(
        prompt: string,
        systemPrompt: string,
        options?: {
            jsonMode?: boolean;
            temperature?: number;
            maxRetries?: number;
        }
    ): Promise<string>;

    /**
     * Parses a JSON response from the LLM.
     */
    parseJSON<T>(response: string): T;
}
