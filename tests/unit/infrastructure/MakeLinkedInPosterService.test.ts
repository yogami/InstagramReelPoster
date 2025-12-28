/**
 * WebhookLinkedInPosterService Tests
 * 
 * Tests for Make.com LinkedIn posting service.
 */

import { WebhookLinkedInPosterService } from '../../../src/infrastructure/linkedin/WebhookLinkedInPosterService';
import { LinkedInPostPayload } from '../../../src/domain/ports/ILinkedInPosterService';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookLinkedInPosterService', () => {
    const validWebhookUrl = 'https://hook.eu2.make.com/test-webhook-id';
    const validApiKey = 'test-api-key';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // =====================================================
    // Constructor Validation
    // =====================================================
    describe('Constructor', () => {
        it('should create service with valid webhook URL and API key', () => {
            const service = new WebhookLinkedInPosterService(validWebhookUrl, validApiKey);
            expect(service).toBeInstanceOf(WebhookLinkedInPosterService);
        });

        it('should reject empty webhook URL', () => {
            expect(() => new WebhookLinkedInPosterService('', validApiKey)).toThrow('LinkedIn webhook URL is required');
        });

        it('should reject empty API key', () => {
            expect(() => new WebhookLinkedInPosterService(validWebhookUrl, '')).toThrow('LinkedIn webhook API key is required');
        });

        it('should reject whitespace-only webhook URL', () => {
            expect(() => new WebhookLinkedInPosterService('   ', validApiKey)).toThrow('LinkedIn webhook URL is required');
        });
    });

    // =====================================================
    // Post to LinkedIn
    // =====================================================
    describe('postToLinkedIn', () => {
        it('should post content successfully', async () => {
            mockedAxios.post.mockResolvedValue({
                status: 200,
                data: { postId: 'urn:li:share:12345' }
            });

            const service = new WebhookLinkedInPosterService(validWebhookUrl, validApiKey);
            const result = await service.postToLinkedIn({
                type: 'ARTICLE',
                content: 'Test LinkedIn post content',
                visibility: 'PUBLIC',
                media: {
                    title: 'Test Title',
                    originalUrl: 'https://example.com'
                }
            });

            expect(result.success).toBe(true);
            expect(result.postId).toBe('urn:li:share:12345');
        });

        it('should send correct payload to webhook', async () => {
            mockedAxios.post.mockResolvedValue({ status: 200, data: {} });

            const service = new WebhookLinkedInPosterService(validWebhookUrl, validApiKey);
            const payload: LinkedInPostPayload = {
                type: 'ARTICLE',
                content: 'My post content',
                visibility: 'PUBLIC',
                media: {
                    title: 'My Title',
                    description: 'My Desc',
                    originalUrl: 'https://example.com/article'
                }
            };

            await service.postToLinkedIn(payload);

            expect(mockedAxios.post).toHaveBeenCalledWith(
                validWebhookUrl,
                payload,
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                        'x-make-apikey': validApiKey
                    })
                })
            );
        });

        it('should handle 401 unauthorized error', async () => {
            mockedAxios.post.mockRejectedValue({
                isAxiosError: true,
                response: {
                    status: 401,
                    data: { error: 'Unauthorized' }
                }
            });
            jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

            const service = new WebhookLinkedInPosterService(validWebhookUrl, validApiKey);
            const result = await service.postToLinkedIn({
                type: 'NONE',
                content: 'Test',
                visibility: 'PUBLIC'
            });

            expect(result.success).toBe(false);
            expect(result.error).toContain('401');
        });

        it('should handle network errors', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network error'));
            jest.spyOn(axios, 'isAxiosError').mockReturnValue(false);

            const service = new WebhookLinkedInPosterService(validWebhookUrl, validApiKey);
            const result = await service.postToLinkedIn({
                type: 'NONE',
                content: 'Test',
                visibility: 'PUBLIC'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Network error');
        });
    });
});
