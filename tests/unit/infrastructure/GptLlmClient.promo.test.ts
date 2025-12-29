import nock from 'nock';
import { GptLlmClient } from '../../../src/infrastructure/llm/GptLlmClient';
import { WebsitePromoInput, WebsiteAnalysis } from '../../../src/domain/entities/WebsitePromo';
import { VIRAL_HOOKS, getPromptTemplate } from '../../../src/infrastructure/llm/CategoryPrompts';

describe('GptLlmClient.generatePromoScript', () => {
    let client: GptLlmClient;
    const apiKey = 'test-api-key';

    beforeEach(() => {
        client = new GptLlmClient(apiKey, 'gpt-4', 'https://api.openai.com');
        nock.cleanAll();
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should inject a viral hook into the prompt and return its type', async () => {
        const input: WebsitePromoInput = {
            websiteUrl: 'https://example-cafe.com',
            consent: true,
            language: 'en'
        };

        const analysis: WebsiteAnalysis = {
            heroText: 'Best Coffee in Berlin',
            metaDescription: 'Artisanal roastery in Kreuzberg',
            keywords: ['coffee', 'cafe'],
            address: 'Friedrichstr. 123, 10117 Berlin',
            sourceUrl: 'https://example-cafe.com',
            siteDNA: {
                painScore: 5,
                trustSignals: [],
                urgency: null,
                confidence: 0.8
            }
        };

        const category = 'cafe';
        const template = getPromptTemplate(category);
        const businessName = 'Example Cafe';
        const language = 'en';

        // Mock OpenAI Response
        const mockResponse = {
            coreMessage: 'Experience coffee differently.',
            scenes: [
                { duration: 4, imagePrompt: 'test', narration: 'test', subtitle: 'test', role: 'hook' },
                { duration: 8, imagePrompt: 'test', narration: 'test', subtitle: 'test', role: 'showcase' },
                { duration: 5, imagePrompt: 'test', narration: 'test', subtitle: 'test', role: 'cta' }
            ],
            musicStyle: 'lofi-beats',
            caption: 'Come visit us!'
        };

        let capturedPrompt = '';
        nock('https://api.openai.com')
            .post('/v1/chat/completions', (body) => {
                // OpenAI API request body structure:
                // { model: '...', messages: [{role: 'system', ...}, {role: 'user', content: '...'}] }
                const userMessage = body.messages.find((m: any) => m.role === 'user');
                capturedPrompt = userMessage ? userMessage.content : '';
                return true;
            })
            .reply(200, {
                choices: [{
                    message: {
                        content: JSON.stringify(mockResponse)
                    }
                }]
            });

        const result = await client.generatePromoScript(
            analysis,
            category,
            template,
            businessName,
            language
        );

        expect(result).toBeDefined();

        // 1. Verify a valid hook type was returned
        expect(result.hookType).toBeDefined();
        const validHookIds = VIRAL_HOOKS.map(h => h.id);
        expect(validHookIds).toContain(result.hookType);

        // 2. Verify the prompt contained the specific instructions for that hook
        const usedHook = VIRAL_HOOKS.find(h => h.id === result.hookType);
        expect(usedHook).toBeDefined();

        if (capturedPrompt && usedHook) {
            console.log(`Verified Hook: ${usedHook.name}`);
            expect(capturedPrompt).toContain(`virality_strategy: ${usedHook.name}`);
            expect(capturedPrompt).toContain(usedHook.structureInstruction);
            expect(capturedPrompt).toContain(usedHook.visualInstruction);

            // Verify contact info is passed
            expect(capturedPrompt).toContain('CONTACT INFO: Address: Friedrichstr. 123');

            // Verify No Text rule is present
            expect(capturedPrompt).toContain('DO NOT include any text, phone numbers');
        } else {
            throw new Error('Could not capture prompt or identify used hook');
        }
    });
});
