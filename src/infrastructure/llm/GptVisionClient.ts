import axios from 'axios';
import {
    IImageVerificationClient,
    ImageVerificationResult,
    ImageVerificationExpectations,
} from '../../domain/ports/IImageVerificationClient';

/**
 * Vision client using GPT-4o for image content verification.
 */
export class GptVisionClient implements IImageVerificationClient {
    private readonly apiKey: string;
    private readonly model: string;
    private readonly baseUrl: string;

    constructor(
        apiKey: string,
        model: string = 'gpt-4o',
        baseUrl: string = 'https://api.openai.com'
    ) {
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
    }

    async verifyImageContent(
        imageUrl: string,
        expectations: ImageVerificationExpectations
    ): Promise<ImageVerificationResult> {
        const prompt = this.buildPrompt(expectations);

        try {
            const response = await axios.post(
                `${this.baseUrl}/v1/chat/completions`,
                {
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: prompt },
                                {
                                    type: 'image_url',
                                    image_url: { url: imageUrl },
                                },
                            ],
                        },
                    ],
                    max_tokens: 500,
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
            return this.parseResponse(content, expectations);
        } catch (error: any) {
            const message = error.response?.data?.error?.message || error.message;
            throw new Error(`Vision API error: ${message}`);
        }
    }

    private buildPrompt(expectations: ImageVerificationExpectations): string {
        const instructions: string[] = [
            'Analyze this image carefully and answer the following questions.',
            'Return your response as JSON with the following structure:',
            '{ "hasText": boolean, "detectedText": string[], "containedElements": string[], "issues": string[] }',
        ];

        if (expectations.mustBeTextFree) {
            instructions.push(
                '1. Does this image contain ANY visible text, letters, numbers, or words? Set "hasText" to true/false.',
                '2. If text is present, list all detected text in "detectedText" array.'
            );
        }

        if (expectations.mustContain?.length) {
            instructions.push(
                `3. Does the image contain the following elements: ${expectations.mustContain.join(', ')}? List found elements in "containedElements".`
            );
        }

        if (expectations.mustNotContain?.length) {
            instructions.push(
                `4. Does the image contain any of these forbidden elements: ${expectations.mustNotContain.join(', ')}? If found, add to "issues".`
            );
        }

        return instructions.join('\n');
    }

    private parseResponse(
        content: string,
        expectations: ImageVerificationExpectations
    ): ImageVerificationResult {
        try {
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());

            const issues: string[] = parsed.issues || [];
            const detectedText: string[] = parsed.detectedText || [];
            let isValid = true;

            // Check mustBeTextFree constraint
            if (expectations.mustBeTextFree && parsed.hasText) {
                isValid = false;
                issues.push('Text detected in image');
            }

            // Check mustContain constraint
            if (expectations.mustContain) {
                const found = new Set(parsed.containedElements?.map((e: string) => e.toLowerCase()) || []);
                for (const required of expectations.mustContain) {
                    if (!found.has(required.toLowerCase())) {
                        isValid = false;
                        issues.push(`Required element not found: ${required}`);
                    }
                }
            }

            // Check mustNotContain constraint
            if (expectations.mustNotContain && parsed.containedElements) {
                const found = parsed.containedElements.map((e: string) => e.toLowerCase());
                for (const forbidden of expectations.mustNotContain) {
                    if (found.includes(forbidden.toLowerCase())) {
                        isValid = false;
                        issues.push(`Forbidden element found: ${forbidden}`);
                    }
                }
            }

            return {
                isValid,
                detectedText,
                issues,
                rawAnalysis: content,
            };
        } catch (parseError) {
            return {
                isValid: false,
                detectedText: [],
                issues: [`Failed to parse vision response: ${content.substring(0, 200)}`],
                rawAnalysis: content,
            };
        }
    }
}
