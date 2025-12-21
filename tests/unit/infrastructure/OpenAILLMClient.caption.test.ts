import axios from 'axios';
import nock from 'nock';
import { OpenAILLMClient } from '../../../src/infrastructure/llm/OpenAILLMClient';

describe('OpenAILLMClient Caption Generation', () => {
    const apiKey = 'test-api-key';
    const model = 'gpt-4o';
    let client: OpenAILLMClient;

    beforeEach(() => {
        client = new OpenAILLMClient(apiKey, model);
        if (!nock.isActive()) nock.activate();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.restore();
    });

    it('should correctly parse caption and hashtags from OpenAI response', async () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: JSON.stringify({
                        captionBody: "Viral caption here.",
                        hashtags: ["#tag1", "#tag2", "#tag3"]
                    })
                }
            }]
        };

        nock('https://api.openai.com')
            .post('/v1/chat/completions')
            .reply(200, mockResponse);

        const result = await client.generateCaptionAndTags("full script", "summary");

        expect(result.captionBody).toBe("Viral caption here.");
        expect(result.hashtags).toEqual(["#tag1", "#tag2", "#tag3"]);
    });

    it('should provide default hashtags if the LLM response is missing them', async () => {
        const mockResponse = {
            choices: [{
                message: {
                    content: JSON.stringify({
                        captionBody: "Viral caption without tags."
                        // hashtags missing
                    })
                }
            }]
        };

        nock('https://api.openai.com')
            .post('/v1/chat/completions')
            .reply(200, mockResponse);

        const result = await client.generateCaptionAndTags("full script", "summary");

        expect(result.captionBody).toBe("Viral caption without tags.");
        expect(result.hashtags).toBeDefined();
        expect(result.hashtags.length).toBeGreaterThan(0);
        expect(result.hashtags).toContain('#ChallengingView');
    });
});
