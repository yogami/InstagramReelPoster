/**
 * Contract Tests for External API Integrations
 * 
 * These tests validate that our request payloads match the expected schema
 * of external APIs WITHOUT making real API calls. Zero cost, instant feedback.
 * 
 * Purpose: Catch contract mismatches (like sending unsupported parameters)
 * before they reach production.
 */

import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true });

// =============================================================================
// BEAM.CLOUD FLUX IMAGE GENERATION CONTRACT
// =============================================================================

/**
 * Beam.cloud Flux endpoint expects:
 * - prompt: string (required)
 * - aspect_ratio: string (optional, e.g., '9:16', '16:9', '1:1')
 * 
 * It does NOT accept: quality, model, size, or any other parameters.
 */
const BEAM_FLUX_SCHEMA = {
    type: 'object',
    properties: {
        prompt: { type: 'string', minLength: 1 },
        aspect_ratio: { type: 'string', enum: ['9:16', '16:9', '1:1', '4:3', '3:4'] }
    },
    required: ['prompt'],
    additionalProperties: false // CRITICAL: Rejects unknown fields like 'quality'
};

describe('Beam.cloud Flux Contract', () => {
    const validate = ajv.compile(BEAM_FLUX_SCHEMA);

    test('should accept valid payload with prompt only', () => {
        const payload = { prompt: 'A beautiful sunset over the ocean' };
        expect(validate(payload)).toBe(true);
    });

    test('should accept valid payload with prompt and aspect_ratio', () => {
        const payload = { prompt: 'A mountain landscape', aspect_ratio: '9:16' };
        expect(validate(payload)).toBe(true);
    });

    test('should REJECT payload with unsupported "quality" field', () => {
        const payload = { prompt: 'Test', aspect_ratio: '9:16', quality: 'hd' };
        expect(validate(payload)).toBe(false);
        expect(validate.errors?.some(e => e.keyword === 'additionalProperties')).toBe(true);
    });

    test('should REJECT payload with unsupported "model" field', () => {
        const payload = { prompt: 'Test', model: 'flux-1.1-pro' };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT payload with unsupported "size" field', () => {
        const payload = { prompt: 'Test', size: '1024x1024' };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT payload with empty prompt', () => {
        const payload = { prompt: '' };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT payload without prompt', () => {
        const payload = { aspect_ratio: '9:16' };
        expect(validate(payload)).toBe(false);
    });
});

// =============================================================================
// OPENROUTER (MULTIMODEL) IMAGE GENERATION CONTRACT
// =============================================================================

/**
 * OpenRouter chat/completions endpoint for image generation.
 * The model must support 'image' modality.
 */
const OPENROUTER_IMAGE_SCHEMA = {
    type: 'object',
    properties: {
        model: { type: 'string', minLength: 1 },
        messages: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                    content: { type: 'string' }
                },
                required: ['role', 'content']
            },
            minItems: 1
        },
        modalities: {
            type: 'array',
            items: { type: 'string', enum: ['text', 'image'] }
        }
    },
    required: ['model', 'messages'],
    additionalProperties: true // OpenRouter accepts additional fields
};

describe('OpenRouter Image Generation Contract', () => {
    const validate = ajv.compile(OPENROUTER_IMAGE_SCHEMA);

    test('should accept valid image generation request', () => {
        const payload = {
            model: 'black-forest-labs/FLUX.1-schnell-Free',
            messages: [{ role: 'user', content: 'Generate a sunset image' }],
            modalities: ['image']
        };
        expect(validate(payload)).toBe(true);
    });

    test('should accept request without modalities (text-only model)', () => {
        const payload = {
            model: 'openai/gpt-4',
            messages: [{ role: 'user', content: 'Hello' }]
        };
        expect(validate(payload)).toBe(true);
    });

    test('should REJECT request without model', () => {
        const payload = {
            messages: [{ role: 'user', content: 'Test' }]
        };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT request without messages', () => {
        const payload = {
            model: 'some-model'
        };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT request with empty messages array', () => {
        const payload = {
            model: 'some-model',
            messages: []
        };
        expect(validate(payload)).toBe(false);
    });
});

// =============================================================================
// FISH AUDIO TTS CONTRACT
// =============================================================================

/**
 * Fish Audio TTS endpoint expects:
 * - text: string (required)
 * - reference_id: string (voice ID, required)
 * - format: string (optional, e.g., 'mp3', 'wav')
 * - speed: number (optional, 0.5-2.0)
 * - pitch: number (optional, 0.5-2.0)
 */
const FISH_AUDIO_TTS_SCHEMA = {
    type: 'object',
    properties: {
        text: { type: 'string', minLength: 1 },
        reference_id: { type: 'string', minLength: 1 },
        format: { type: 'string', enum: ['mp3', 'wav', 'ogg', 'flac'] },
        speed: { type: 'number', minimum: 0.5, maximum: 2.0 },
        pitch: { type: 'number', minimum: 0.5, maximum: 2.0 }
    },
    required: ['text', 'reference_id'],
    additionalProperties: false
};

describe('Fish Audio TTS Contract', () => {
    const validate = ajv.compile(FISH_AUDIO_TTS_SCHEMA);

    test('should accept valid TTS request', () => {
        const payload = {
            text: 'Hello world',
            reference_id: 'voice-123',
            format: 'mp3',
            speed: 1.0,
            pitch: 1.0
        };
        expect(validate(payload)).toBe(true);
    });

    test('should accept minimal TTS request', () => {
        const payload = {
            text: 'Hello world',
            reference_id: 'voice-123'
        };
        expect(validate(payload)).toBe(true);
    });

    test('should REJECT request with unsupported field', () => {
        const payload = {
            text: 'Hello',
            reference_id: 'voice-123',
            emotion: 'happy' // Not supported
        };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT request without text', () => {
        const payload = {
            reference_id: 'voice-123'
        };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT request without reference_id', () => {
        const payload = {
            text: 'Hello world'
        };
        expect(validate(payload)).toBe(false);
    });

    test('should REJECT speed outside valid range', () => {
        const payload = {
            text: 'Hello',
            reference_id: 'voice-123',
            speed: 5.0 // Too fast
        };
        expect(validate(payload)).toBe(false);
    });
});
