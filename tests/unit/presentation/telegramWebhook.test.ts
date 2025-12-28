
import { Request, Response, NextFunction } from 'express';
import { createTelegramWebhookRoutes } from '../../../src/presentation/routes/telegramWebhook';
import { JobManager } from '../../../src/application/JobManager';
import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { UnauthorizedError } from '../../../src/presentation/middleware/errorHandler';

// 1. Mock Config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        telegramSecretToken: 'test-secret-token',
        makeWebhookUrl: 'https://hook.make.com/test',
        telegramBotToken: 'test-bot-token',
        telegramWebhookSecret: 'test-secret-token',
        linkedinWebhookUrl: 'https://hook.make.com/linkedin',
        linkedinWebhookApiKey: 'linkedin-key',
        llmApiKey: 'openai-key',
        llmModel: 'gpt-4'
    }))
}));

// 2. Mock ChatService (Class)
const mockSendMessage = jest.fn().mockResolvedValue(undefined);
const mockGetFileUrl = jest.fn().mockResolvedValue('https://telegram.files/audio.mp3');

jest.mock('../../../src/presentation/services/ChatService', () => ({
    ChatService: jest.fn().mockImplementation(() => ({
        sendMessage: mockSendMessage,
        getFileUrl: mockGetFileUrl
    }))
}));

// 3. Mock LinkedIn Services
const mockGenerateDraftContent = jest.fn().mockResolvedValue({
    // Using snake_case as expected by LinkedInDraftContent interface
    hook: 'Test Hook',
    core_tension: 'Test Tension',
    outline_bullets: ['Point 1', 'Point 2', 'Point 3'],
    closer_options: ['Closer 1'],
    hashtags: ['#test']
});

jest.mock('../../../src/infrastructure/linkedin/GptLinkedInDraftService', () => ({
    GptLinkedInDraftService: jest.fn().mockImplementation(() => ({
        generateDraftContent: mockGenerateDraftContent
    }))
}));

const mockPostToLinkedIn = jest.fn().mockResolvedValue({ success: true, postId: '123' });
jest.mock('../../../src/infrastructure/linkedin/WebhookLinkedInPosterService', () => ({
    WebhookLinkedInPosterService: jest.fn().mockImplementation(() => ({
        postToLinkedIn: mockPostToLinkedIn
    }))
}));

describe('Telegram Webhook Routes', () => {
    let mockJobManager: jest.Mocked<JobManager>;
    let mockOrchestrator: jest.Mocked<ReelOrchestrator>;
    let routeHandlers: Map<string, Function>;
    let mockRouter: any;

    beforeEach(() => {
        jest.clearAllMocks();
        routeHandlers = new Map();

        // Router mock
        mockRouter = {
            post: jest.fn().mockImplementation((path: string, ...handlers: Function[]) => {
                const effectiveHandler = handlers[handlers.length - 1];
                routeHandlers.set(`POST ${path}`, effectiveHandler);

                // If there's middleware (more than 1 arg), store it
                if (handlers.length > 1) {
                    routeHandlers.set(`POST ${path}_middleware`, handlers[0]);
                }
                return mockRouter;
            })
        };
        const express = require('express');
        jest.spyOn(express, 'Router').mockReturnValue(mockRouter);

        // Service mocks
        mockJobManager = {
            createJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'pending' }),
            getJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateJob: jest.fn(),
            getLastJobForUser: jest.fn().mockResolvedValue({ id: 'job-123' })
        } as any;

        mockOrchestrator = {
            processJob: jest.fn().mockResolvedValue(undefined),
            approvalService: {
                handleCallback: jest.fn().mockResolvedValue(undefined)
            }
        } as any;
    });

    const invokeHandler = async (path: string, req: Partial<Request>, res: Partial<Response>, next: NextFunction) => {
        const handler = routeHandlers.get(`POST ${path}`);
        if (!handler) {
            console.error(`Handlers registered:`, Array.from(routeHandlers.keys()));
            throw new Error(`Handler for POST ${path} not found`);
        }
        await handler(req, res, next);
        // Wait for fire-and-forget promises
        await new Promise(resolve => setImmediate(resolve));
    };

    describe('Secret Validation', () => {
        beforeEach(() => {
            createTelegramWebhookRoutes(mockJobManager, mockOrchestrator);
        });

        test('should validate correct secret', () => {
            const middleware = routeHandlers.get('POST /telegram-webhook_middleware');
            const req = { headers: { 'x-telegram-bot-api-secret-token': 'test-secret-token' } } as any;
            const next = jest.fn();

            if (!middleware) throw new Error('Middleware not found');
            middleware(req, {} as Response, next);
            expect(next).toHaveBeenCalled();
        });

        test('should reject incorrect secret', () => {
            const middleware = routeHandlers.get('POST /telegram-webhook_middleware');
            const req = { headers: { 'x-telegram-bot-api-secret-token': 'wrong' } } as any;
            const next = jest.fn();

            if (!middleware) throw new Error('Middleware not found');
            expect(() => middleware(req, {} as Response, next)).toThrow(UnauthorizedError);
        });
    });

    describe('Message Processing', () => {
        let req: Partial<Request>;
        let res: Partial<Response>;
        let next: NextFunction;

        beforeEach(() => {
            createTelegramWebhookRoutes(mockJobManager, mockOrchestrator);
            req = {
                body: { update_id: 1, message: { chat: { id: 123 }, message_id: 1 } },
                headers: { 'x-telegram-bot-api-secret-token': 'test-secret-token' }
            };
            res = {
                status: jest.fn().mockReturnThis(),
                json: jest.fn()
            };
            next = jest.fn();
        });

        test('should process voice message', async () => {
            req.body.message.voice = { file_id: 'voice-123', duration: 10 };

            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockGetFileUrl).toHaveBeenCalledWith('voice-123');
            expect(mockJobManager.createJob).toHaveBeenCalledWith(expect.objectContaining({
                sourceAudioUrl: 'https://telegram.files/audio.mp3',
                telegramChatId: 123
            }));
            expect(mockSendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Voice received'));
            expect(mockOrchestrator.processJob).toHaveBeenCalledWith('job-123');
        });

        test('should process text command /help', async () => {
            req.body.message.text = '/help';

            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockSendMessage).toHaveBeenCalledWith(123, expect.stringContaining('VoiceGen Bot'));
        });

        test('should process approval command "approve"', async () => {
            req.body.message.text = 'approve';

            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockOrchestrator.approvalService.handleCallback).toHaveBeenCalledWith('job-123', 'script', true);
            expect(mockOrchestrator.approvalService.handleCallback).toHaveBeenCalledWith('job-123', 'visuals', true);
        });

        test('should process simple text prompt', async () => {
            req.body.message.text = 'Create a reel about space';

            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockJobManager.createJob).toHaveBeenCalledWith(expect.objectContaining({
                transcript: 'Create a reel about space',
                telegramChatId: 123
            }));
            expect(mockOrchestrator.processJob).toHaveBeenCalledWith('job-123');
        });

        test('should generate LinkedIn draft', async () => {
            req.body.message.text = 'linkedin My thought is that AI is great';

            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockGenerateDraftContent).toHaveBeenCalled();
            expect(mockSendMessage).toHaveBeenCalledWith(123, expect.stringContaining('LinkedIn Draft'));
        });

        test('should post LinkedIn draft', async () => {
            // 1. Generate draft to store in pendingLinkedInDrafts
            // To ensure state persistence, we must assume pendingLinkedInDrafts module variable retains state.
            // Since we mocked services but not the module logic itself, it should work.
            req.body.message.text = 'linkedin Draft content';
            await invokeHandler('/telegram-webhook', req, res, next);

            // 2. Post
            req.body.message.text = 'post';
            await invokeHandler('/telegram-webhook', req, res, next);

            expect(mockPostToLinkedIn).toHaveBeenCalled();
            expect(mockSendMessage).toHaveBeenCalledWith(123, expect.stringContaining('Posted to LinkedIn'));
        });
    });
});
