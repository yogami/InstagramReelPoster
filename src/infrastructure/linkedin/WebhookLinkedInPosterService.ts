/**
 * WebhookLinkedInPosterService
 * 
 * Posts LinkedIn content via Make.com webhook.
 * Uses x-make-apikey header for authentication.
 */

import axios from 'axios';
import { ILinkedInPosterService, LinkedInPostPayload, LinkedInPostResult } from '../../domain/ports/ILinkedInPosterService';

export class WebhookLinkedInPosterService implements ILinkedInPosterService {
    private readonly webhookUrl: string;
    private readonly apiKey: string;

    constructor(webhookUrl: string, apiKey: string) {
        if (!webhookUrl.trim()) {
            throw new Error('LinkedIn webhook URL is required');
        }
        if (!apiKey.trim()) {
            throw new Error('LinkedIn webhook API key is required');
        }
        this.webhookUrl = webhookUrl.trim();
        this.apiKey = apiKey.trim();
    }

    async postToLinkedIn(payload: LinkedInPostPayload): Promise<LinkedInPostResult> {
        try {
            console.log(`[LinkedIn] Posting to Make.com webhook: ${this.webhookUrl.substring(0, 50)}...`);

            const response = await axios.post(
                this.webhookUrl,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'x-make-apikey': this.apiKey,
                    },
                    timeout: 30000,
                }
            );

            console.log(`[LinkedIn] Make.com response status: ${response.status}`);

            // Make.com typically returns 200 on success
            if (response.status >= 200 && response.status < 300) {
                // Extract postId from Make.com response if available
                const postId = response.data?.postId || response.data?.id || undefined;
                return {
                    success: true,
                    postId,
                };
            }

            return {
                success: false,
                error: `Unexpected response status: ${response.status}`,
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[LinkedIn] Failed to post: ${errorMessage}`);

            if (axios.isAxiosError(error) && error.response) {
                return {
                    success: false,
                    error: `HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`,
                };
            }

            return {
                success: false,
                error: errorMessage,
            };
        }
    }
}
