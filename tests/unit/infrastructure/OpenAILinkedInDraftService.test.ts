/**
 * OpenAILinkedInDraftService Tests
 * 
 * AC4: OpenAI LinkedIn Draft Generator
 */

import { OpenAILinkedInDraftService } from '../../../src/infrastructure/linkedin/OpenAILinkedInDraftService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAILinkedInDraftService (AC4)', () => {
    const validApiKey = 'test-api-key';
    let service: OpenAILinkedInDraftService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new OpenAILinkedInDraftService(validApiKey);
    });

    // =====================================================
    // Constructor Validation
    // =====================================================
    describe('Constructor', () => {
        it('should create service with valid API key', () => {
            expect(service).toBeInstanceOf(OpenAILinkedInDraftService);
        });

        it('should reject empty API key', () => {
            expect(() => new OpenAILinkedInDraftService('')).toThrow('OpenAI API key is required');
        });
    });

    // =====================================================
    // Draft Generation
    // =====================================================
    describe('generateDraftContent', () => {
        const validResponse = {
            data: {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            core_tension: 'Founders mistake speed for progress.',
                            hook: 'You are busy but not productive. Here is the difference.',
                            outline_bullets: [
                                'Speed without direction is chaos',
                                'Real progress is measured in decisions',
                                'The best founders do less, not more'
                            ],
                            closer_options: [
                                'When did you last stop to ask why?',
                                'Stillness is strategy, not laziness.'
                            ],
                            hashtags: [
                                '#AIautomation',
                                '#solopreneur',
                                '#buildinpublic'
                            ]
                        })
                    }
                }]
            }
        };

        it('should generate draft from raw note', async () => {
            mockedAxios.post.mockResolvedValue(validResponse);

            const result = await service.generateDraftContent('I think founders confuse hustle with progress');

            expect(result.core_tension).toBe('Founders mistake speed for progress.');
            expect(result.hook).toContain('You are busy');
            expect(result.outline_bullets).toHaveLength(3);
            expect(result.closer_options).toHaveLength(2);
        });

        it('should include raw note in prompt', async () => {
            mockedAxios.post.mockResolvedValue(validResponse);

            await service.generateDraftContent('My raw thoughts about spiritual bypassing');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    messages: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'user',
                            content: expect.stringContaining('spiritual bypassing')
                        })
                    ])
                }),
                expect.any(Object)
            );
        });

        it('should use JSON response format', async () => {
            mockedAxios.post.mockResolvedValue(validResponse);

            await service.generateDraftContent('Test note');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    response_format: { type: 'json_object' }
                }),
                expect.any(Object)
            );
        });

        it('should include outreach optimization in system prompt', async () => {
            mockedAxios.post.mockResolvedValue(validResponse);

            await service.generateDraftContent('Test note');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.any(String),
                expect.objectContaining({
                    messages: expect.arrayContaining([
                        expect.objectContaining({
                            role: 'system',
                            content: expect.stringContaining('MAXIMIZE OUTREACH')
                        })
                    ])
                }),
                expect.any(Object)
            );
        });
    });

    // =====================================================
    // Response Validation
    // =====================================================
    describe('Response Validation', () => {
        it('should reject response missing core_tension', async () => {
            mockedAxios.post.mockResolvedValue({
                data: {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                hook: 'Test hook',
                                outline_bullets: ['a', 'b', 'c'],
                                closer_options: ['x']
                            })
                        }
                    }]
                }
            });

            await expect(service.generateDraftContent('Test')).rejects.toThrow('Missing or invalid core_tension');
        });

        it('should reject response with fewer than 3 bullets', async () => {
            mockedAxios.post.mockResolvedValue({
                data: {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                core_tension: 'Tension',
                                hook: 'Hook',
                                outline_bullets: ['a', 'b'],
                                closer_options: ['x']
                            })
                        }
                    }]
                }
            });

            await expect(service.generateDraftContent('Test')).rejects.toThrow('at least 3 items');
        });

        it('should reject response with no closer options', async () => {
            mockedAxios.post.mockResolvedValue({
                data: {
                    choices: [{
                        message: {
                            content: JSON.stringify({
                                core_tension: 'Tension',
                                hook: 'Hook',
                                outline_bullets: ['a', 'b', 'c'],
                                closer_options: []
                            })
                        }
                    }]
                }
            });

            await expect(service.generateDraftContent('Test')).rejects.toThrow('at least 1 item');
        });
    });
});
