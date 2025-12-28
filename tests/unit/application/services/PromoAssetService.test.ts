
import { PromoAssetService, PreparePromoAssetsOptions } from '../../../../src/application/services/PromoAssetService';
import { JobManager } from '../../../../src/application/JobManager';
import { createReelJob } from '../../../../src/domain/entities/ReelJob';
import { SegmentContent } from '../../../../src/domain/ports/ILlmClient';

// Mock dependencies
const mockTtsClient = {
    synthesize: jest.fn()
};
const mockFallbackTtsClient = {
    synthesize: jest.fn()
};
const mockPrimaryImageClient = {
    generateImage: jest.fn(),
    resetSequence: jest.fn()
};
const mockFallbackImageClient = {
    generateImage: jest.fn(),
    resetSequence: jest.fn()
};
const mockStorageClient = {
    uploadAudio: jest.fn(),
    uploadImage: jest.fn()
};
const mockMusicSelector = {
    selectMusic: jest.fn()
};
const mockJobManager = {
    updateJob: jest.fn(),
    updateStatus: jest.fn(),
    getJob: jest.fn()
};

describe('PromoAssetService', () => {
    let service: PromoAssetService;
    let mockDeps: any;

    beforeEach(() => {
        jest.clearAllMocks();
        mockDeps = {
            jobManager: mockJobManager,
            ttsClient: mockTtsClient,
            fallbackTtsClient: mockFallbackTtsClient,
            primaryImageClient: mockPrimaryImageClient,
            fallbackImageClient: mockFallbackImageClient,
            storageClient: mockStorageClient,
            musicSelector: mockMusicSelector
        };
        service = new PromoAssetService(mockDeps as any);
    });

    describe('preparePromoAssets', () => {
        const mockJob = createReelJob('job-123', {
            websitePromoInput: { websiteUrl: 'https://test.com', consent: true }
        }, { min: 30, max: 60 });

        const options: PreparePromoAssetsOptions = {
            jobId: 'job-123',
            job: mockJob,
            segmentContent: [
                { commentary: 'Segment 1', imagePrompt: 'Prompt 1', caption: 'Cap 1' },
                { commentary: 'Segment 2', imagePrompt: 'Prompt 2', caption: 'Cap 2' }
            ],
            fullCommentary: 'Segment 1 Segment 2',
            targetDuration: 30,
            category: 'cafe',
            promoScript: {
                coreMessage: 'Come visit',
                category: 'cafe',
                businessName: 'My Cafe',
                scenes: [
                    { duration: 15, narration: 'Segment 1', imagePrompt: 'Prompt 1', subtitle: 'Cap 1', role: 'hook' },
                    { duration: 15, narration: 'Segment 2', imagePrompt: 'Prompt 2', subtitle: 'Cap 2', role: 'cta' }
                ],
                musicStyle: 'lofi',
                caption: 'Caption',
                compliance: { source: 'public-website', consent: true, scrapedAt: new Date() },
                language: 'en'
            }
        };

        test('should orchestrate asset generation successfully', async () => {
            // Mock dependency responses
            mockTtsClient.synthesize.mockResolvedValue({ audioUrl: 'http://tts.com/audio.mp3', durationSeconds: 30 });
            mockMusicSelector.selectMusic.mockResolvedValue({ track: { audioUrl: 'http://music.com/track.mp3', durationSeconds: 120 }, source: 'catalog' });
            mockJobManager.getJob.mockResolvedValue({ websiteAnalysis: { scrapedMedia: [] } }); // No scraped media
            mockPrimaryImageClient.generateImage.mockResolvedValue({ imageUrl: 'http://image.com/gen.png' });
            mockStorageClient.uploadImage.mockResolvedValue({ url: 'http://cloudinary.com/gen.png' });

            const result = await service.preparePromoAssets(options);

            // Verify TTS
            expect(mockTtsClient.synthesize).toHaveBeenCalledWith('Segment 1 Segment 2', expect.any(Object));
            expect(result.voiceoverUrl).toBe('http://tts.com/audio.mp3');

            // Verify Music
            expect(mockMusicSelector.selectMusic).toHaveBeenCalled();
            expect(result.musicUrl).toBe('http://music.com/track.mp3');

            // Verify Images (2 segments => 2 generations because no user/scraped media)
            expect(mockPrimaryImageClient.generateImage).toHaveBeenCalledTimes(2);
            expect(result.segmentsWithImages).toHaveLength(2);
            expect(result.segmentsWithImages[0].imageUrl).toBeDefined();

            // Verify Job Updates
            expect(mockJobManager.updateJob).toHaveBeenCalledTimes(3); // voiceover, music, final-segments
        });

        test('should apply speed adjustment if TTS duration deviates significantly', async () => {
            // First call returns 40s (target 30s) -> too long
            mockTtsClient.synthesize
                .mockResolvedValueOnce({ audioUrl: 'slow.mp3', durationSeconds: 40 })
                .mockResolvedValueOnce({ audioUrl: 'fast.mp3', durationSeconds: 30 }); // Second call with speed adj

            mockMusicSelector.selectMusic.mockResolvedValue({ track: { audioUrl: 'music.mp3' } });
            mockPrimaryImageClient.generateImage.mockResolvedValue({ imageUrl: 'img.png' });

            await service.preparePromoAssets(options);

            // Should call synthesized twice: once normal, once with speed adjustment
            expect(mockTtsClient.synthesize).toHaveBeenCalledTimes(2);
            // Second call should have speed > 1
            const secondCallArgs = mockTtsClient.synthesize.mock.calls[1][1];
            expect(secondCallArgs.speed).toBeGreaterThan(1);
        });

        test('should upload base64 TTS audio to storage', async () => {
            mockTtsClient.synthesize.mockResolvedValue({ audioUrl: 'data:audio/mp3;base64,somesound', durationSeconds: 30 });
            mockStorageClient.uploadAudio.mockResolvedValue({ url: 'http://cloudinary.com/audio.mp3' });
            mockMusicSelector.selectMusic.mockResolvedValue({});
            mockPrimaryImageClient.generateImage.mockResolvedValue({ imageUrl: 'img.png' });

            const result = await service.preparePromoAssets(options);

            expect(mockStorageClient.uploadAudio).toHaveBeenCalled();
            expect(result.voiceoverUrl).toBe('http://cloudinary.com/audio.mp3');
        });

        test('should prioritize user provided media', async () => {
            const userMediaJob = {
                ...createReelJob('job-123', { websitePromoInput: { websiteUrl: 'test.com', consent: true } }, { min: 30, max: 60 }),
                websitePromoInput: {
                    websiteUrl: 'test.com',
                    consent: true,
                    providedMedia: ['http://user.com/img1.png']
                }
            };

            const optionsWithMedia = { ...options, job: userMediaJob };

            mockTtsClient.synthesize.mockResolvedValue({ audioUrl: 'tts.mp3', durationSeconds: 30 });
            mockMusicSelector.selectMusic.mockResolvedValue({});

            // First segment uses user media, second needs AI
            mockPrimaryImageClient.generateImage.mockResolvedValue({ imageUrl: 'ai.png' });

            // Mock upload to return a specific URL for the user image
            mockStorageClient.uploadImage.mockResolvedValueOnce({ url: 'http://cloudinary.com/user-upload.png' });

            const result = await service.preparePromoAssets(optionsWithMedia);

            expect(result.segmentsWithImages[0].imageUrl).toBe('http://cloudinary.com/user-upload.png');
            expect(mockPrimaryImageClient.generateImage).toHaveBeenCalledTimes(1); // Only for second segment
        });
    });
});
