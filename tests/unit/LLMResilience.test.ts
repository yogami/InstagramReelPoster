import { OpenAILLMClient } from '../../src/infrastructure/llm/OpenAILLMClient';

describe('LLM Resilience - Segment Normalization', () => {
    let client: any;

    beforeEach(() => {
        client = new OpenAILLMClient('test-key');
    });

    it('should pass through a plain array', () => {
        const input = [
            { commentary: 'text 1', imagePrompt: 'prompt 1' },
            { commentary: 'text 2', imagePrompt: 'prompt 2' }
        ];
        const result = client.normalizeSegments(input);
        expect(result).toHaveLength(2);
        expect(result[0].commentary).toBe('text 1');
    });

    it('should unwrap an object containing a "segments" array', () => {
        const input = {
            segments: [
                { commentary: 'text 1', imagePrompt: 'prompt 1' },
                { commentary: 'text 2', imagePrompt: 'prompt 2' }
            ]
        };
        const result = client.normalizeSegments(input);
        expect(result).toHaveLength(2);
        expect(result[0].commentary).toBe('text 1');
    });

    it('should wrap a single object into an array', () => {
        const input = { commentary: 'text 1', imagePrompt: 'prompt 1' };
        const result = client.normalizeSegments(input);
        expect(result).toHaveLength(1);
        expect(result[0].commentary).toBe('text 1');
    });

    it('should handle numbered object keys (common LLM failure mode)', () => {
        const input = {
            "0": { commentary: 'text 1', imagePrompt: 'prompt 1' },
            "1": { commentary: 'text 2', imagePrompt: 'prompt 2' }
        };
        const result = client.normalizeSegments(input);
        expect(result).toHaveLength(2);
        expect(result[0].commentary).toBe('text 1');
    });

    it('should throw for completely invalid data types', () => {
        expect(() => client.normalizeSegments("just some text")).toThrow();
        expect(() => client.normalizeSegments(null)).toThrow();
        expect(() => client.normalizeSegments(123)).toThrow();
    });
});
