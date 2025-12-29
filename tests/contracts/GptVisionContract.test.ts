import Ajv from 'ajv';

/**
 * Contract Tests: GPT-4o Vision API
 * Validates request payloads match OpenAI's vision API schema.
 */
describe('GPT-4o Vision API Contract', () => {
    const ajv = new Ajv({ allErrors: true });

    // OpenAI Vision API request schema
    const visionRequestSchema = {
        type: 'object',
        required: ['model', 'messages'],
        properties: {
            model: {
                type: 'string',
                pattern: '^gpt-4'
            },
            messages: {
                type: 'array',
                items: {
                    type: 'object',
                    required: ['role', 'content'],
                    properties: {
                        role: {
                            type: 'string',
                            enum: ['system', 'user', 'assistant']
                        },
                        content: {
                            oneOf: [
                                { type: 'string' },
                                {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        required: ['type'],
                                        properties: {
                                            type: {
                                                type: 'string',
                                                enum: ['text', 'image_url']
                                            },
                                            text: { type: 'string' },
                                            image_url: {
                                                type: 'object',
                                                required: ['url'],
                                                properties: {
                                                    url: { type: 'string', format: 'uri' },
                                                    detail: {
                                                        type: 'string',
                                                        enum: ['auto', 'low', 'high']
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            ]
                        }
                    }
                }
            },
            max_tokens: {
                type: 'integer',
                minimum: 1,
                maximum: 4096
            },
            response_format: {
                type: 'object',
                properties: {
                    type: {
                        type: 'string',
                        enum: ['text', 'json_object']
                    }
                }
            }
        }
    };

    const validateVisionRequest = ajv.compile(visionRequestSchema);

    it('should validate a correct vision request payload', () => {
        const validPayload = {
            model: 'gpt-4o',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'Analyze this image for text content.' },
                        {
                            type: 'image_url',
                            image_url: { url: 'https://example.com/image.jpg' }
                        }
                    ]
                }
            ],
            max_tokens: 500,
            response_format: { type: 'json_object' }
        };

        const isValid = validateVisionRequest(validPayload);
        expect(isValid).toBe(true);
        if (!isValid) {
            console.log(validateVisionRequest.errors);
        }
    });

    it('should reject request without model', () => {
        const invalidPayload = {
            messages: [
                {
                    role: 'user',
                    content: 'Test'
                }
            ]
        };

        const isValid = validateVisionRequest(invalidPayload);
        expect(isValid).toBe(false);
    });

    it('should reject request with invalid role', () => {
        const invalidPayload = {
            model: 'gpt-4o',
            messages: [
                {
                    role: 'invalid_role',
                    content: 'Test'
                }
            ]
        };

        const isValid = validateVisionRequest(invalidPayload);
        expect(isValid).toBe(false);
    });

    it('should accept multimodal content array', () => {
        const multimodalPayload = {
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: 'What is in this image?' },
                        {
                            type: 'image_url',
                            image_url: {
                                url: 'https://cdn.example.com/photo.png',
                                detail: 'high'
                            }
                        }
                    ]
                }
            ]
        };

        const isValid = validateVisionRequest(multimodalPayload);
        expect(isValid).toBe(true);
    });
});
