import axios from 'axios';
import { ReelJob } from '../../domain/entities/ReelJob';
import { getConfig } from '../../config';

interface NotificationPayload {
    job_id: string;
    status: string;
    video_url?: string;
    url?: string;
    caption?: string;
    error?: string;
    timestamp: string;
}

/**
 * NotificationService handles callback webhooks and external notifications.
 * Extracted from ReelOrchestrator to reduce complexity.
 */
export class NotificationService {
    constructor(
        private readonly callbackToken?: string,
        private readonly callbackHeader?: string
    ) { }

    /**
     * Sends a webhook notification to the job's callbackUrl.
     */
    async notifyCallback(job: ReelJob): Promise<void> {
        if (!job.callbackUrl) {
            console.log(`[${job.id}] No callbackUrl, skipping notification`);
            return;
        }

        const payload = this.buildPayload(job);
        const headers = this.buildHeaders();

        console.log(`[${job.id}] Sending callback to ${job.callbackUrl}`);
        console.log(`[${job.id}] Callback payload:`, JSON.stringify(payload, null, 2));

        try {
            const response = await axios.post(job.callbackUrl, payload, {
                headers,
                timeout: 30000,
            });
            console.log(`[${job.id}] Callback response: ${response.status}`);
        } catch (error) {
            this.logError(job.id, error);
        }
    }

    private buildPayload(job: ReelJob): NotificationPayload {
        const payload: NotificationPayload = {
            job_id: job.id,
            status: job.status,
            timestamp: new Date().toISOString(),
        };

        if (job.status === 'completed' && job.finalVideoUrl) {
            payload.video_url = job.finalVideoUrl;
            payload.url = job.finalVideoUrl;
            payload.caption = job.captionBody || '';
        }

        if (job.status === 'failed' && job.error) {
            payload.error = job.error;
        }

        return payload;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (this.callbackToken && this.callbackHeader) {
            headers[this.callbackHeader] = this.callbackToken;
        }

        return headers;
    }

    private logError(jobId: string, error: unknown): void {
        if (axios.isAxiosError(error)) {
            console.error(`[${jobId}] Callback failed:`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message,
            });
        } else {
            console.error(`[${jobId}] Callback error:`, error);
        }
    }
}
