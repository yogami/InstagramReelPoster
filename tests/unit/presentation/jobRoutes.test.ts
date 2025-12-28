
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { createJobRoutes } from '../../../src/presentation/routes/jobRoutes';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJob } from '../../../src/domain/entities/ReelJob';
import axios from 'axios';
import { errorHandler } from '../../../src/presentation/middleware/errorHandler';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('JobRoutes', () => {
    let app: express.Express;
    let mockJobManager: jest.Mocked<JobManager>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            getJob: jest.fn(),
            getAllJobs: jest.fn(),
            // unused in routes but required by interface
            createJob: jest.fn(),
            updateJob: jest.fn(),
            updateStatus: jest.fn(),
            failJob: jest.fn(),
        } as any;

        app = express();
        app.use(bodyParser.json());
        app.use(createJobRoutes(mockJobManager));
        app.use(errorHandler); // Register error handler
    });

    describe('GET /jobs/:jobId', () => {
        test('should return 404 if job not found', async () => {
            mockJobManager.getJob.mockResolvedValue(null);

            const res = await request(app).get('/jobs/missing-id');
            expect(res.status).toBe(404);
            expect(res.body.error.message).toContain('Job not found');
        });

        test('should return job details for completed job', async () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'completed',
                createdAt: new Date(),
                updatedAt: new Date(),
                voiceoverDurationSeconds: 10,
                finalVideoUrl: 'http://vid.mp4',
                manifest: {},
                segments: []
            } as any;
            mockJobManager.getJob.mockResolvedValue(job);

            const res = await request(app).get('/jobs/job-123');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('completed');
            expect(res.body.finalVideoUrl).toBe('http://vid.mp4');
        });

        test('should return job details for failed job', async () => {
            const job: ReelJob = {
                id: 'job-err',
                status: 'failed',
                error: 'Something broke',
                createdAt: new Date(),
                updatedAt: new Date()
            } as any;
            mockJobManager.getJob.mockResolvedValue(job);

            const res = await request(app).get('/jobs/job-err');
            expect(res.status).toBe(200);
            expect(res.body.status).toBe('failed');
            expect(res.body.error).toBe('Something broke');
        });
    });

    describe('GET /jobs', () => {
        test('should return list of job summaries', async () => {
            const jobs: ReelJob[] = [
                { id: 'j1', status: 'completed', createdAt: new Date(), updatedAt: new Date(), finalVideoUrl: 'url' } as any,
                { id: 'j2', status: 'pending', createdAt: new Date(), updatedAt: new Date() } as any
            ];
            mockJobManager.getAllJobs.mockResolvedValue(jobs);

            const res = await request(app).get('/jobs');
            expect(res.status).toBe(200);
            expect(res.body.total).toBe(2);
            expect(res.body.jobs[0].jobId).toBe('j1');
            expect(res.body.jobs[0].hasVideo).toBe(true);
            expect(res.body.jobs[1].hasVideo).toBe(false);
        });
    });

    describe('POST /test-webhook', () => {
        test('should return 400 if webhookUrl missing', async () => {
            const res = await request(app).post('/test-webhook').send({});
            expect(res.status).toBe(400);
            expect(res.body.error).toContain('Missing webhookUrl');
        });

        test('should call axios and return success', async () => {
            mockedAxios.post.mockResolvedValue({ status: 200, data: { ok: true } });

            const res = await request(app)
                .post('/test-webhook')
                .send({ webhookUrl: 'http://hook.com' });

            expect(res.status).toBe(200);
            expect(mockedAxios.post).toHaveBeenCalledWith(
                'http://hook.com',
                expect.any(Object),
                expect.objectContaining({ headers: expect.any(Object) })
            );
            expect(res.body.success).toBe(true);
        });

        test('should handle axios errors', async () => {
            mockedAxios.post.mockRejectedValue(new Error('Network Error'));

            const res = await request(app)
                .post('/test-webhook')
                .send({ webhookUrl: 'http://hook.com' });

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.error).toBe('Network Error');
        });
    });
});
