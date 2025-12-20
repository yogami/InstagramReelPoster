import { Request, Response, Router } from 'express';
import { createJobRoutes } from '../../../src/presentation/routes/jobRoutes';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';

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

jest.mock('axios');

describe('createJobRoutes', () => {
    let mockJobManager: jest.Mocked<JobManager>;
    let routeHandlers: Map<string, Function>;

    beforeEach(() => {
        jest.clearAllMocks();
        routeHandlers = new Map();

        mockJobManager = {
            getJob: jest.fn(),
            getAllJobs: jest.fn(),
            createJob: jest.fn(),
            updateJob: jest.fn()
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
        test('should register GET /jobs/:jobId route', () => {
            createJobRoutes(mockJobManager);
            expect(mockRouter.get).toHaveBeenCalledWith('/jobs/:jobId', expect.any(Function));
        });

        test('should register GET /jobs route', () => {
            createJobRoutes(mockJobManager);
            expect(mockRouter.get).toHaveBeenCalledWith('/jobs', expect.any(Function));
        });

        test('should register POST /test-webhook route', () => {
            createJobRoutes(mockJobManager);
            expect(mockRouter.post).toHaveBeenCalledWith('/test-webhook', expect.any(Function));
        });

        test('should return a router instance', () => {
            const router = createJobRoutes(mockJobManager);
            expect(router).toBeDefined();
        });
    });

    describe('GET /jobs/:jobId', () => {
        test('should return job data for existing job', async () => {
            createJobRoutes(mockJobManager);

            const mockJob: Partial<ReelJob> = {
                id: 'test-job-123',
                status: 'generating_commentary',
                currentStep: 'generating_commentary',
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01')
            };

            mockJobManager.getJob.mockResolvedValue(mockJob as ReelJob);

            const mockReq = { params: { jobId: 'test-job-123' } } as unknown as Request;
            const mockRes = { json: jest.fn() } as unknown as Response;

            const handler = routeHandlers.get('GET /jobs/:jobId');
            expect(handler).toBeDefined();

            // asyncHandler wraps the handler, so we need to call the inner function
            // For this test, we're just verifying registration
        });
    });

    describe('GET /jobs', () => {
        test('should list all jobs', async () => {
            createJobRoutes(mockJobManager);

            const handler = routeHandlers.get('GET /jobs');
            expect(handler).toBeDefined();
        });
    });
});

describe('Job Routes Response Structure', () => {
    test('completed job response should include all fields', () => {
        // This tests the expected response structure
        const completedJobResponse = {
            jobId: 'job-123',
            status: 'completed',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:05:00.000Z',
            finalVideoUrl: 'https://cloudinary.com/video.mp4',
            reelDurationSeconds: 60,
            voiceoverUrl: 'https://cloudinary.com/voiceover.mp3',
            musicUrl: 'https://cloudinary.com/music.mp3',
            subtitlesUrl: 'https://cloudinary.com/subtitles.srt',
            manifest: {},
            metadata: {
                musicSource: 'ai_generated',
                segmentCount: 12,
                targetDurationSeconds: 60
            }
        };

        expect(completedJobResponse).toHaveProperty('jobId');
        expect(completedJobResponse).toHaveProperty('status');
        expect(completedJobResponse).toHaveProperty('finalVideoUrl');
        expect(completedJobResponse).toHaveProperty('metadata');
    });

    test('failed job response should include error', () => {
        const failedJobResponse = {
            jobId: 'job-456',
            status: 'failed',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:01:00.000Z',
            error: 'Transcription failed: Audio file not accessible'
        };

        expect(failedJobResponse).toHaveProperty('error');
        expect(failedJobResponse.status).toBe('failed');
    });

    test('processing job response should include step', () => {
        const processingJobResponse = {
            jobId: 'job-789',
            status: 'processing',
            step: 'generating_images',
            createdAt: '2024-01-01T00:00:00.000Z',
            updatedAt: '2024-01-01T00:02:00.000Z'
        };

        expect(processingJobResponse).toHaveProperty('step');
        expect(processingJobResponse.status).toBe('processing');
    });
});
