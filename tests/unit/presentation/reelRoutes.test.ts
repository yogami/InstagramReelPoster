
import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import { createReelRoutes } from '../../../src/presentation/routes/reelRoutes';
import { JobManager } from '../../../src/application/JobManager';
import { ReelOrchestrator } from '../../../src/application/ReelOrchestrator';
import { IGrowthInsightsService } from '../../../src/domain/ports/IGrowthInsightsService';
import { errorHandler } from '../../../src/presentation/middleware/errorHandler';

// Mock Config
jest.mock('../../../src/config', () => ({
    getConfig: jest.fn(() => ({
        makeWebhookUrl: 'http://make.com/default'
    }))
}));

describe('ReelRoutes', () => {
    let app: express.Express;
    let mockJobManager: jest.Mocked<JobManager>;
    let mockOrchestrator: jest.Mocked<ReelOrchestrator>;
    let mockGrowthService: jest.Mocked<IGrowthInsightsService>;

    beforeEach(() => {
        jest.clearAllMocks();

        mockJobManager = {
            createJob: jest.fn(),
            getLastJobForUser: jest.fn(),
            getJob: jest.fn(),
            updateJob: jest.fn(),
            // ... other methods as required
        } as any;

        mockOrchestrator = {
            processJob: jest.fn().mockResolvedValue(undefined),
        } as any;

        mockGrowthService = {
            recordAnalytics: jest.fn(),
        } as any;

        app = express();
        app.use(bodyParser.json());
        app.use('/', createReelRoutes(mockJobManager, mockOrchestrator, mockGrowthService));
        app.use(errorHandler);
    });

    describe('POST /process-reel', () => {
        test('should validate input (missing sourceAudioUrl)', async () => {
            const res = await request(app).post('/process-reel').send({});
            expect(res.status).toBe(400);
            expect(res.body.error.message).toContain('sourceAudioUrl is required');
        });

        test('should validate input (invalid duration)', async () => {
            const res = await request(app).post('/process-reel').send({
                sourceAudioUrl: 'http://audio.mp3',
                targetDurationRange: { min: 60, max: 30 } // Invalid
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toContain('min cannot be greater than max');
        });

        test('should start job successfully', async () => {
            const mockJob = { id: 'job-123', status: 'pending' };
            mockJobManager.createJob.mockResolvedValue(mockJob as any);

            const res = await request(app).post('/process-reel').send({
                sourceAudioUrl: 'http://test.com/audio.mp3',
                forceMode: 'direct'
            });

            expect(res.status).toBe(202);
            expect(res.body.jobId).toBe('job-123');
            expect(res.body.contentMode).toBe('direct');

            expect(mockJobManager.createJob).toHaveBeenCalledWith(expect.objectContaining({
                sourceAudioUrl: 'http://test.com/audio.mp3',
                forceMode: 'direct'
            }));

            // Check Orchestrator call (async)
            expect(mockOrchestrator.processJob).toHaveBeenCalledWith('job-123');
        });
    });

    describe('POST /website', () => {
        test('should require consent', async () => {
            const res = await request(app).post('/website').send({
                website: 'http://test.com'
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toContain('consent must be true');
        });

        test('should validate category', async () => {
            const res = await request(app).post('/website').send({
                website: 'http://test.com',
                consent: true,
                category: 'invalid-cat'
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toContain('category must be one of');
        });

        test('should start website promo job', async () => {
            const mockJob = { id: 'promo-123', status: 'pending' };
            mockJobManager.createJob.mockResolvedValue(mockJob as any);

            const res = await request(app).post('/website').send({
                website: 'http://cafe.com',
                businessName: 'My Cafe',
                category: 'cafe',
                consent: true,
                media: ['http://img1.png']
            });

            expect(res.status).toBe(202);
            expect(res.body.jobId).toBe('promo-123');

            expect(mockJobManager.createJob).toHaveBeenCalledWith(expect.objectContaining({
                websitePromoInput: expect.objectContaining({
                    websiteUrl: 'http://cafe.com',
                    providedMedia: ['http://img1.png']
                })
            }));

            expect(mockOrchestrator.processJob).toHaveBeenCalledWith('promo-123');
        });
    });

    describe('POST /retry-last', () => {
        test('should fail if no previous job', async () => {
            mockJobManager.getLastJobForUser.mockResolvedValue(null);

            const res = await request(app).post('/retry-last').send({ telegramChatId: 123 });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toContain('No previous job found');
        });

        test('should retry last job', async () => {
            const lastJob = {
                id: 'old-1',
                sourceAudioUrl: 'http://old.mp3',
                telegramChatId: 123
            };
            const newJob = { id: 'new-1', status: 'pending' };

            mockJobManager.getLastJobForUser.mockResolvedValue(lastJob as any);
            mockJobManager.createJob.mockResolvedValue(newJob as any);

            const res = await request(app).post('/retry-last').send({ telegramChatId: 123 });

            expect(res.status).toBe(202);
            expect(res.body.jobId).toBe('new-1');
            expect(res.body.originalJobId).toBe('old-1');

            expect(mockJobManager.createJob).toHaveBeenCalledWith(expect.objectContaining({
                sourceAudioUrl: 'http://old.mp3',
                telegramChatId: 123
            }));
            expect(mockOrchestrator.processJob).toHaveBeenCalledWith('new-1');
        });
    });
});
