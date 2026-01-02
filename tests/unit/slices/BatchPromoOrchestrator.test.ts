/**
 * Unit Tests for BatchPromoOrchestrator
 */

import { BatchPromoOrchestrator, BatchPromoInput } from '../../../src/slices/website-promo/application/BatchPromoOrchestrator';
import { WebsitePromoOrchestrator } from '../../../src/slices/website-promo/application/WebsitePromoOrchestrator';

describe('BatchPromoOrchestrator', () => {
    let mockSingleOrchestrator: jest.Mocked<WebsitePromoOrchestrator>;
    let batchOrchestrator: BatchPromoOrchestrator;

    beforeEach(() => {
        mockSingleOrchestrator = {
            processJob: jest.fn()
        } as any;

        batchOrchestrator = new BatchPromoOrchestrator(mockSingleOrchestrator);
    });

    it('should process all websites in batch', async () => {
        mockSingleOrchestrator.processJob.mockResolvedValue({
            jobId: 'test',
            status: 'completed',
            result: { videoUrl: 'https://example.com/video.mp4' }
        } as any);

        const input: BatchPromoInput = {
            websites: [
                { websiteUrl: 'https://site1.com', consent: true },
                { websiteUrl: 'https://site2.com', consent: true },
                { websiteUrl: 'https://site3.com', consent: true }
            ],
            parallelism: 2
        };

        const result = await batchOrchestrator.processBatch(input);

        expect(result.totalJobs).toBe(3);
        expect(result.successCount).toBe(3);
        expect(result.failureCount).toBe(0);
        expect(result.results).toHaveLength(3);
        expect(mockSingleOrchestrator.processJob).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures', async () => {
        mockSingleOrchestrator.processJob
            .mockResolvedValueOnce({ status: 'completed', result: { videoUrl: 'url1' } } as any)
            .mockResolvedValueOnce({ status: 'failed', error: 'API Error' } as any)
            .mockResolvedValueOnce({ status: 'completed', result: { videoUrl: 'url3' } } as any);

        const input: BatchPromoInput = {
            websites: [
                { websiteUrl: 'https://site1.com', consent: true },
                { websiteUrl: 'https://site2.com', consent: true },
                { websiteUrl: 'https://site3.com', consent: true }
            ]
        };

        const result = await batchOrchestrator.processBatch(input);

        expect(result.successCount).toBe(2);
        expect(result.failureCount).toBe(1);
    });

    it('should call progress callback', async () => {
        mockSingleOrchestrator.processJob.mockResolvedValue({
            status: 'completed',
            result: { videoUrl: 'url' }
        } as any);

        const progressCallback = jest.fn();
        const input: BatchPromoInput = {
            websites: [
                { websiteUrl: 'https://site1.com', consent: true },
                { websiteUrl: 'https://site2.com', consent: true }
            ],
            onProgress: progressCallback
        };

        await batchOrchestrator.processBatch(input);

        expect(progressCallback).toHaveBeenCalledTimes(2);
    });

    it('should respect parallelism limit', async () => {
        let concurrentJobs = 0;
        let maxConcurrent = 0;

        mockSingleOrchestrator.processJob.mockImplementation(async () => {
            concurrentJobs++;
            maxConcurrent = Math.max(maxConcurrent, concurrentJobs);
            await new Promise(resolve => setTimeout(resolve, 50));
            concurrentJobs--;
            return { status: 'completed', result: { videoUrl: 'url' } } as any;
        });

        const input: BatchPromoInput = {
            websites: Array(5).fill({ websiteUrl: 'https://test.com', consent: true }),
            parallelism: 2
        };

        await batchOrchestrator.processBatch(input);

        expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
});
