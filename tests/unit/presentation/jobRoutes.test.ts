import { Request, Response, Router } from 'express';
import { createJobRoutes } from '../../../src/presentation/routes/jobRoutes';
import axios from 'axios';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';
import { NotFoundError } from '../../../src/presentation/middleware/errorHandler';

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
        beforeEach(() => {
            // Register routes before each test to capture handlers
            createJobRoutes(mockJobManager);
        });

        test('should return job data for existing job', async () => {
            const mockJob: Partial<ReelJob> = {
                id: 'test-job-123',
                status: 'completed',
                currentStep: undefined,
                createdAt: new Date('2024-01-01'),
                updatedAt: new Date('2024-01-01'),
                finalVideoUrl: 'http://video.mp4',
                voiceoverDurationSeconds: 10,
                segments: [],
                targetDurationSeconds: 15
            };

            mockJobManager.getJob.mockResolvedValue(mockJob as ReelJob);

            const req = { params: { jobId: 'test-job-123' } } as unknown as Request;
            const res = { json: jest.fn() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('GET /jobs/:jobId');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);

            expect(mockJobManager.getJob).toHaveBeenCalledWith('test-job-123');
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                jobId: 'test-job-123',
                status: 'completed',
                finalVideoUrl: 'http://video.mp4'
            }));
        });

        test('should throw NotFoundError if job not found', async () => {
            mockJobManager.getJob.mockResolvedValue(null);

            const req = { params: { jobId: 'non-existent' } } as unknown as Request;
            const res = { json: jest.fn() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('GET /jobs/:jobId');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);
            expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
            expect(next.mock.calls[0][0].message).toContain('Job not found: non-existent');
        });
    });

    describe('GET /jobs', () => {
        beforeEach(() => {
            createJobRoutes(mockJobManager);
        });

        test('should list all jobs summary', async () => {
            const mockJobs: Partial<ReelJob>[] = [
                {
                    id: 'job-1',
                    status: 'completed',
                    createdAt: new Date('2024-01-01'),
                    updatedAt: new Date('2024-01-02'),
                    finalVideoUrl: 'http://video.mp4'
                },
                {
                    id: 'job-2',
                    status: 'processing' as any, // Cast to any to avoid strict enum check in test
                    currentStep: 'generating_images',
                    createdAt: new Date('2024-01-03'),
                    updatedAt: new Date('2024-01-03'),
                    finalVideoUrl: undefined
                }
            ];

            mockJobManager.getAllJobs.mockResolvedValue(mockJobs as unknown as ReelJob[]);

            const req = {} as Request;
            const res = { json: jest.fn() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('GET /jobs');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);

            expect(mockJobManager.getAllJobs).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith({
                total: 2,
                jobs: expect.arrayContaining([
                    expect.objectContaining({ jobId: 'job-1', status: 'completed', hasVideo: true }),
                    expect.objectContaining({ jobId: 'job-2', status: 'processing', hasVideo: false })
                ])
            });
        });
    });

    describe('POST /test-webhook', () => {
        beforeEach(() => {
            createJobRoutes(mockJobManager);
        });

        test('should send test webhook and return success', async () => {
            (axios.post as jest.Mock).mockResolvedValue({ status: 200, data: { success: true } });

            const req = { body: { webhookUrl: 'http://webhook.site/123' } } as unknown as Request;
            const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('POST /test-webhook');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);

            expect(axios.post).toHaveBeenCalledWith(
                'http://webhook.site/123',
                expect.objectContaining({ jobId: 'test_job_123', status: 'completed' }),
                expect.any(Object)
            );
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: true,
                message: 'Test webhook sent successfully'
            }));
        });

        test('should return 400 if webhookUrl missing', async () => {
            const req = { body: {} } as unknown as Request;
            const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('POST /test-webhook');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('Missing webhookUrl') }));
        });

        test('should return 500 if axios request fails', async () => {
            (axios.post as jest.Mock).mockRejectedValue(new Error('Network error'));

            const req = { body: { webhookUrl: 'http://fail.com' } } as unknown as Request;
            const res = { json: jest.fn(), status: jest.fn().mockReturnThis() } as unknown as Response;
            const next = jest.fn();

            const handler = routeHandlers.get('POST /test-webhook');
            if (!handler) throw new Error('Handler not found');
            await handler(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                success: false,
                error: 'Network error'
            }));
        });
    });
});
