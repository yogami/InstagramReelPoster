import { ReelJob, failJob } from '../../domain/entities/ReelJob';
import { INotificationClient } from '../../domain/ports/INotificationClient';
import { JobManager } from '../JobManager';

export class OrchestratorErrorService {
    constructor(
        private readonly jobManager: JobManager,
        private readonly notificationClient?: INotificationClient
    ) { }

    /**
     * Handles errors in website promo job processing.
     */
    async handlePromoJobError(jobId: string, job: ReelJob, error: unknown): Promise<never> {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[${jobId}] Website promo job failed:`, error);

        failJob(job, errorMessage); // Update job state to failed
        await this.jobManager.updateJob(jobId, { status: 'failed', error: errorMessage });

        if (job.telegramChatId && this.notificationClient) {
            await this.notificationClient.sendNotification(
                job.telegramChatId,
                `❌ *Website promo reel failed*\n\n${this.getFriendlyErrorMessage(errorMessage)}`
            );
        }

        throw error;
    }

    /**
     * Converts technical error messages to user-friendly ones.
     */
    getFriendlyErrorMessage(error: string): string {
        const lowerError = error.toLowerCase();
        if (lowerError.includes('transcribe') || lowerError.includes('whisper')) {
            return 'I could not understand the audio. Please try recording again with less background noise.';
        }
        if (lowerError.includes('gpt') || lowerError.includes('ai service') || lowerError.includes('api key')) {
            return 'There was an issue connecting to our AI services. Please try again in a moment.';
        }
        if (lowerError.includes('rendering') || lowerError.includes('timeout')) {
            return 'The video rendering failed. This can happen with very complex scripts. Please try a simpler prompt.';
        }
        if (lowerError.includes('image') || lowerError.includes('dalle') || lowerError.includes('generation')) {
            return 'There was trouble generating images for your reel. Please try a different theme.';
        }
        if (lowerError.includes('duration') || lowerError.includes('too short') || lowerError.includes('too long')) {
            return 'The generated audio was too short or too long for a reel. I am automatically trying to fix this.';
        }
        if (lowerError.includes('music') || lowerError.includes('track')) {
            return 'I could not find suitable background music for your reel. Using a default track instead.';
        }
        if (lowerError.includes('insufficient credits')) {
            return 'Service credits exhausted. Please contact admin.';
        }
        return 'Something went wrong. An unexpected error occurred. Please try again.';
    }
}
