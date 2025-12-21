/**
 * ApprovalService - Manages user approval checkpoints with auto-timeout.
 * 
 * Sends approval requests via Telegram with inline keyboards.
 * If user doesn't respond within timeout, auto-approves.
 */

import { TelegramService } from '../presentation/services/TelegramService';

export type ApprovalCheckpoint = 'script' | 'visuals';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timeout';

export interface ApprovalRequest {
    jobId: string;
    chatId: number;
    checkpoint: ApprovalCheckpoint;
    timeoutSeconds: number;
    messageId?: number;
    status: ApprovalStatus;
    summary: string;
    feedback?: string;  // User feedback on rejection
    createdAt: Date;
    resolvedAt?: Date;
}

export interface ApprovalResult {
    approved: boolean;
    reason: 'user_approved' | 'user_rejected' | 'timeout' | 'no_telegram';
    feedback?: string;  // If rejected, contains user's feedback for regeneration
}

// Timeout values per checkpoint
export const CHECKPOINT_TIMEOUTS: Record<ApprovalCheckpoint, number> = {
    script: 60,    // 60 seconds for script review
    visuals: 120,  // 120 seconds for visuals review
};

export class ApprovalService {
    private pendingApprovals: Map<string, ApprovalRequest> = new Map();
    private telegramService: TelegramService | null;

    constructor(telegramService: TelegramService | null) {
        this.telegramService = telegramService;
    }

    /**
     * Request user approval at a checkpoint.
     * Returns immediately if no Telegram chat (auto-approve).
     * Otherwise, sends message and waits for response or timeout.
     */
    async requestApproval(
        jobId: string,
        chatId: number | undefined,
        checkpoint: ApprovalCheckpoint,
        summary: string
    ): Promise<ApprovalResult> {
        // No Telegram chat = auto-approve (API jobs)
        if (!chatId || !this.telegramService) {
            console.log(`[${jobId}] No Telegram chat - auto-approving ${checkpoint}`);
            return { approved: true, reason: 'no_telegram' };
        }

        const timeoutSeconds = CHECKPOINT_TIMEOUTS[checkpoint];
        const request: ApprovalRequest = {
            jobId,
            chatId,
            checkpoint,
            timeoutSeconds,
            status: 'pending',
            summary,
            createdAt: new Date(),
        };

        // Store pending approval
        const key = this.getKey(jobId, checkpoint);
        this.pendingApprovals.set(key, request);

        // Send approval message with inline keyboard
        await this.sendApprovalMessage(request);

        // Wait for response or timeout
        return this.waitForApproval(request);
    }

    /**
     * Handle callback from Telegram user response.
     * @param feedback - User's feedback if rejected (for regeneration)
     */
    async handleCallback(jobId: string, checkpoint: ApprovalCheckpoint, approved: boolean, feedback?: string): Promise<boolean> {
        const key = this.getKey(jobId, checkpoint);
        const request = this.pendingApprovals.get(key);

        if (!request || request.status !== 'pending') {
            return false;
        }

        request.status = approved ? 'approved' : 'rejected';
        request.feedback = feedback;
        request.resolvedAt = new Date();

        console.log(`[${jobId}] User ${approved ? 'approved' : 'rejected'} ${checkpoint}${feedback ? ` with feedback: ${feedback}` : ''}`);
        return true;
    }

    /**
     * Check if an approval is still pending.
     */
    isPending(jobId: string, checkpoint: ApprovalCheckpoint): boolean {
        const key = this.getKey(jobId, checkpoint);
        const request = this.pendingApprovals.get(key);
        return request?.status === 'pending';
    }

    private getKey(jobId: string, checkpoint: ApprovalCheckpoint): string {
        return `${jobId}:${checkpoint}`;
    }

    private async sendApprovalMessage(request: ApprovalRequest): Promise<void> {
        if (!this.telegramService) return;

        const emoji = request.checkpoint === 'script' ? '📝' : '🎨';
        const title = request.checkpoint === 'script' ? 'Script Ready' : 'Visuals Ready';

        const message =
            `${emoji} *${title} for Review*\n\n` +
            `${request.summary}\n\n` +
            `⏰ Auto-approves in ${request.timeoutSeconds} seconds\n\n` +
            `Reply with:\n` +
            `• *approve* - Continue processing\n` +
            `• *reject* - Cancel this reel`;

        await this.telegramService.sendMessage(request.chatId, message);
    }

    private async waitForApproval(request: ApprovalRequest): Promise<ApprovalResult> {
        const startTime = Date.now();
        const timeoutMs = request.timeoutSeconds * 1000;
        const pollIntervalMs = 1000; // Check every second

        while (Date.now() - startTime < timeoutMs) {
            // Check if status changed
            if (request.status === 'approved') {
                await this.sendConfirmation(request, true);
                return { approved: true, reason: 'user_approved' };
            }
            if (request.status === 'rejected') {
                await this.sendConfirmation(request, false);
                return { approved: false, reason: 'user_rejected', feedback: request.feedback };
            }

            // Wait before next check
            await this.sleep(pollIntervalMs);
        }

        // Timeout reached - auto-approve
        request.status = 'timeout';
        request.resolvedAt = new Date();
        console.log(`[${request.jobId}] Timeout reached - auto-approving ${request.checkpoint}`);

        if (this.telegramService) {
            await this.telegramService.sendMessage(
                request.chatId,
                `⏰ *Auto-approved* (no response within ${request.timeoutSeconds}s)\n\nContinuing with ${request.checkpoint}...`
            );
        }

        return { approved: true, reason: 'timeout' };
    }

    private async sendConfirmation(request: ApprovalRequest, approved: boolean): Promise<void> {
        if (!this.telegramService) return;

        const message = approved
            ? `✅ *Approved!* Continuing with ${request.checkpoint}...`
            : `🔄 *Regenerating ${request.checkpoint}* based on your feedback...`;

        await this.telegramService.sendMessage(request.chatId, message);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Clean up old pending approvals (garbage collection).
     */
    cleanup(): void {
        const now = Date.now();
        const maxAge = 10 * 60 * 1000; // 10 minutes

        for (const [key, request] of this.pendingApprovals.entries()) {
            if (now - request.createdAt.getTime() > maxAge) {
                this.pendingApprovals.delete(key);
            }
        }
    }
}
