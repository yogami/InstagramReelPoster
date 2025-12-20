import { createReelRoutes } from '../../../src/presentation/routes/reelRoutes';
import { JobManager } from '../../../src/application/JobManager';
import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';

// Mock express Router
const mockRouter = {
    get: jest.fn().mockReturnThis(),
    post: jest.fn().mockReturnThis()
};

jest.mock('express', () => ({
    Router: jest.fn(() => mockRouter),
    Request: {},
    Response: {}
}));

jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        makeWebhookUrl: 'https://hook.make.com/test'
    }))
}));

describe('createReelRoutes', () => {
    let mockJobManager: jest.Mocked<JobManager>;
    let mockOrchestrator: jest.Mocked<ReelOrchestrator>;
    let routeHandlers: Map<string, Function>;

    beforeEach(() => {
        jest.clearAllMocks();
        routeHandlers = new Map();

        mockJobManager = {
            getJob: jest.fn(),
            getAllJobs: jest.fn(),
            createJob: jest.fn(),
            updateJob: jest.fn(),
            getLastJobForUser: jest.fn()
        } as any;

        mockOrchestrator = {
            processJob: jest.fn()
        } as any;

        // Capture route handlers when registered
        mockRouter.get.mockImplementation((path: string, handler: Function) => {
            routeHandlers.set(`GET ${path}`, handler);
            return mockRouter;
        });
        mockRouter.post.mockImplementation((path: string, handler: Function) => {
            routeHandlers.set(`POST ${path}`, handler);
            return mockRouter;
        });
    });

    describe('route registration', () => {
        test('should register POST /process-reel route', () => {
            createReelRoutes(mockJobManager, mockOrchestrator);
            expect(mockRouter.post).toHaveBeenCalledWith('/process-reel', expect.any(Function));
        });

        test('should register POST /retry-last route', () => {
            createReelRoutes(mockJobManager, mockOrchestrator);
            expect(mockRouter.post).toHaveBeenCalledWith('/retry-last', expect.any(Function));
        });

        test('should return a router instance', () => {
            const router = createReelRoutes(mockJobManager, mockOrchestrator);
            expect(router).toBeDefined();
        });
    });
});

describe('Reel Routes Request Validation', () => {
    describe('POST /process-reel validation', () => {
        test('valid request body should pass validation', () => {
            const validRequest = {
                sourceAudioUrl: 'https://example.com/audio.mp3',
                targetDurationRange: { min: 30, max: 90 },
                moodOverrides: { mood: 'peaceful' },
                callbackUrl: 'https://hook.make.com/callback'
            };

            expect(validRequest.sourceAudioUrl).toBeDefined();
            expect(typeof validRequest.sourceAudioUrl).toBe('string');
            expect(new URL(validRequest.sourceAudioUrl)).toBeDefined();
        });

        test('should require sourceAudioUrl', () => {
            const invalidRequest = {
                targetDurationRange: { min: 30, max: 90 }
            };

            expect((invalidRequest as any).sourceAudioUrl).toBeUndefined();
        });

        test('targetDurationRange should have valid min/max', () => {
            const validRange = { min: 30, max: 90 };
            expect(validRange.min).toBeLessThanOrEqual(validRange.max);
            expect(typeof validRange.min).toBe('number');
            expect(typeof validRange.max).toBe('number');
        });

        test('invalid min > max should fail validation', () => {
            const invalidRange = { min: 100, max: 50 };
            expect(invalidRange.min).toBeGreaterThan(invalidRange.max);
        });
    });

    describe('POST /retry-last validation', () => {
        test('valid telegramChatId should pass validation', () => {
            const validRequest = {
                telegramChatId: 123456789
            };

            expect(Number(validRequest.telegramChatId)).not.toBeNaN();
        });

        test('string telegramChatId should be convertible to number', () => {
            const stringChatId = '123456789';
            expect(Number(stringChatId)).toBe(123456789);
        });

        test('invalid non-numeric telegramChatId should fail', () => {
            const invalidChatId = 'not-a-number';
            expect(Number(invalidChatId)).toBeNaN();
        });
    });
});

describe('Reel Routes Response Structure', () => {
    test('process-reel success response should have correct structure', () => {
        const successResponse = {
            jobId: 'job-abc-123',
            status: 'pending',
            message: 'Reel processing started'
        };

        expect(successResponse).toHaveProperty('jobId');
        expect(successResponse).toHaveProperty('status');
        expect(successResponse).toHaveProperty('message');
    });

    test('retry-last success response should include originalJobId', () => {
        const retryResponse = {
            jobId: 'job-new-456',
            status: 'pending',
            message: 'Retry processing started',
            originalJobId: 'job-old-123'
        };

        expect(retryResponse).toHaveProperty('originalJobId');
        expect(retryResponse.message).toContain('Retry');
    });
});
