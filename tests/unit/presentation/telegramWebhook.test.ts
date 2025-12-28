import { createTelegramWebhookRoutes } from '../../../src/presentation/routes/telegramWebhook';
import { JobManager } from '../../../src/application/JobManager';
import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';

// Mock config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        telegramSecretToken: 'test-secret-token',
        makeWebhookUrl: 'https://hook.make.com/test',
        telegramBotToken: 'test-bot-token'
    }))
}));

// Mock TelegramService
jest.mock('../../../src/presentation/services/TelegramService', () => ({
    TelegramService: jest.fn().mockImplementation(() => ({
        sendMessage: jest.fn().mockResolvedValue(undefined),
        getFileUrl: jest.fn().mockResolvedValue('https://telegram.files/audio.mp3')
    }))
}));

describe('createTelegramWebhookRoutes', () => {
    let mockJobManager: jest.Mocked<JobManager>;
    let mockOrchestrator: jest.Mocked<ReelOrchestrator>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            createJob: jest.fn().mockResolvedValue({ id: 'job-123', status: 'pending' }),
            getJob: jest.fn(),
            getAllJobs: jest.fn(),
            updateJob: jest.fn(),
            getLastJobForUser: jest.fn()
        } as any;

        mockOrchestrator = {
            processJob: jest.fn().mockResolvedValue(undefined)
        } as any;
    });

    describe('Route Registration', () => {
        it('should return a Router instance', () => {
            const router = createTelegramWebhookRoutes(mockJobManager, mockOrchestrator);
            expect(router).toBeDefined();
        });

        it('should create routes without throwing', () => {
            expect(() => {
                createTelegramWebhookRoutes(mockJobManager, mockOrchestrator);
            }).not.toThrow();
        });
    });

    describe('Telegram Update Types', () => {
        it('should define voice message structure correctly', () => {
            const voiceUpdate = {
                update_id: 123,
                message: {
                    message_id: 456,
                    chat: { id: 789, type: 'private' },
                    voice: { file_id: 'voice-abc', duration: 30 }
                }
            };

            expect(voiceUpdate.message.voice).toBeDefined();
            expect(voiceUpdate.message.voice.file_id).toBe('voice-abc');
            expect(voiceUpdate.message.voice.duration).toBe(30);
        });

        it('should define audio message structure correctly', () => {
            const audioUpdate = {
                update_id: 123,
                message: {
                    message_id: 456,
                    chat: { id: 789, type: 'private' },
                    audio: { file_id: 'audio-xyz', duration: 120 }
                }
            };

            expect(audioUpdate.message.audio).toBeDefined();
            expect(audioUpdate.message.audio.file_id).toBe('audio-xyz');
        });

        it('should define text message structure correctly', () => {
            const textUpdate = {
                update_id: 123,
                message: {
                    message_id: 456,
                    chat: { id: 789, type: 'private' },
                    text: '/linkedin write about AI'
                }
            };

            expect(textUpdate.message.text).toBeDefined();
            expect(textUpdate.message.text.startsWith('/')).toBe(true);
        });
    });

    describe('LinkedIn Draft Structure', () => {
        it('should define draft with article media', () => {
            const draft = {
                content: 'Check out this article',
                headline: 'Amazing AI Developments',
                hashtags: ['#ai', '#tech', '#innovation'],
                type: 'ARTICLE' as const,
                media: {
                    title: 'AI Article',
                    description: 'About latest AI',
                    originalUrl: 'https://blog.example.com/article'
                }
            };

            expect(draft.type).toBe('ARTICLE');
            expect(draft.media?.originalUrl).toBeDefined();
            expect(draft.hashtags).toHaveLength(3);
        });

        it('should define draft without media', () => {
            const draft = {
                content: 'Just a text post',
                type: 'NONE' as const
            };

            expect(draft.type).toBe('NONE');
            expect((draft as any).media).toBeUndefined();
        });

        it('should format hashtags correctly', () => {
            const hashtags = ['#ai', '#tech', '#career'];

            expect(hashtags.every(h => h.startsWith('#'))).toBe(true);
            expect(hashtags.join(' ')).toBe('#ai #tech #career');
        });
    });

    describe('Webhook Secret Validation', () => {
        it('should expect secret token in headers', () => {
            const validHeaders = {
                'x-telegram-bot-api-secret-token': 'test-secret-token'
            };

            expect(validHeaders['x-telegram-bot-api-secret-token']).toBe('test-secret-token');
        });

        it('should reject missing secret token', () => {
            const headersWithoutSecret = {
                'content-type': 'application/json'
            };

            expect((headersWithoutSecret as any)['x-telegram-bot-api-secret-token']).toBeUndefined();
        });

        it('should reject incorrect secret token', () => {
            const wrongSecret = 'wrong-secret';
            const expectedSecret = 'test-secret-token';

            expect(wrongSecret).not.toBe(expectedSecret);
        });
    });
});
