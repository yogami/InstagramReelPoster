
import { OrchestratorErrorService } from '../../../../src/application/services/OrchestratorErrorService';
import { JobManager } from '../../../../src/application/JobManager';
import { ReelJob, createReelJob } from '../../../../src/domain/entities/ReelJob';

describe('OrchestratorErrorService', () => {
    let service: OrchestratorErrorService;
    let mockJobManager: jest.Mocked<JobManager>;
    let mockNotificationClient: any;

    beforeEach(() => {
        mockJobManager = {
            updateJob: jest.fn(),
            failJob: jest.fn(),
        } as any;

        mockNotificationClient = {
            sendNotification: jest.fn(),
        };

        service = new OrchestratorErrorService(mockJobManager, mockNotificationClient);
    });

    describe('getFriendlyErrorMessage', () => {
        test('should return transcription message for transcribe errors', () => {
            const message = service.getFriendlyErrorMessage('Failed to transcribe audio');
            expect(message).toContain('could not understand the audio');
        });

        test('should return API message for Gpt errors', () => {
            const message = service.getFriendlyErrorMessage('Gpt API rate limit exceeded');
            expect(message).toContain('issue connecting to our AI services');
        });

        test('should return music message for track errors', () => {
            const message = service.getFriendlyErrorMessage('No music tracks found');
            expect(message).toContain('could not find suitable background music');
        });

        test('should return image message for ImageGen errors', () => {
            const message = service.getFriendlyErrorMessage('ImageGen generation failed');
            expect(message).toContain('trouble generating images');
        });

        test('should return render message for video errors', () => {
            const message = service.getFriendlyErrorMessage('Video rendering timeout');
            expect(message).toContain('video rendering failed');
        });

        test('should return duration message for too short/long errors', () => {
            const message = service.getFriendlyErrorMessage('Audio duration too short');
            expect(message).toContain('too short or too long');
        });

        test('should return generic message for unknown errors', () => {
            const message = service.getFriendlyErrorMessage('Some random error');
            expect(message).toContain('unexpected error');
        });

        test('should return credit exhaustion message', () => {
            const message = service.getFriendlyErrorMessage('insufficient credits for operation');
            expect(message).toContain('Service credits exhausted');
        });
    });

    describe('handlePromoJobError', () => {
        const mockJob = createReelJob('job-123', {
            websitePromoInput: { websiteUrl: 'https://test.com', consent: true },
            telegramChatId: 123456
        }, { min: 30, max: 60 });

        test('should fail job and notify user', async () => {
            const error = new Error('Test error');

            await expect(service.handlePromoJobError('job-123', mockJob, error))
                .rejects.toThrow('Test error');

            expect(mockJobManager.updateJob).toHaveBeenCalledWith('job-123', expect.objectContaining({
                status: 'failed',
                error: 'Test error'
            }));

            expect(mockNotificationClient.sendNotification).toHaveBeenCalledWith(
                123456,
                expect.stringContaining('Website promo reel failed')
            );
        });

        test('should fail job without notification if no chatId', async () => {
            const noChatJob = { ...mockJob, telegramChatId: undefined };
            const error = new Error('Test error');

            await expect(service.handlePromoJobError('job-123', noChatJob, error))
                .rejects.toThrow('Test error');

            expect(mockNotificationClient.sendNotification).not.toHaveBeenCalled();
        });
    });
});
