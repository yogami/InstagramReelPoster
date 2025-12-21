/**
 * ApprovalService Unit Tests
 * 
 * Tests user approval checkpoints with auto-timeout.
 */

import { ApprovalService, ApprovalCheckpoint, CHECKPOINT_TIMEOUTS } from '../../../src/application/ApprovalService';

// Mock TelegramService
const mockTelegramService = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
    getFileUrl: jest.fn().mockResolvedValue('http://example.com/file'),
};

describe('ApprovalService', () => {
    let service: ApprovalService;

    beforeEach(() => {
        jest.clearAllMocks();
        service = new ApprovalService(mockTelegramService as any);
    });

    // =====================================================
    // Configuration
    // =====================================================
    describe('Checkpoint Configuration', () => {
        it('script checkpoint should have 60s timeout', () => {
            expect(CHECKPOINT_TIMEOUTS.script).toBe(60);
        });

        it('visuals checkpoint should have 120s timeout', () => {
            expect(CHECKPOINT_TIMEOUTS.visuals).toBe(120);
        });
    });

    // =====================================================
    // Auto-Approve for API Jobs (no Telegram)
    // =====================================================
    describe('Auto-Approve without Telegram', () => {
        it('should auto-approve if no chatId provided', async () => {
            const serviceNoTelegram = new ApprovalService(null);

            const result = await serviceNoTelegram.requestApproval(
                'job_123',
                undefined, // No chatId
                'script',
                'Test summary'
            );

            expect(result.approved).toBe(true);
            expect(result.reason).toBe('no_telegram');
        });

        it('should auto-approve if TelegramService is null', async () => {
            const serviceNoTelegram = new ApprovalService(null);

            const result = await serviceNoTelegram.requestApproval(
                'job_123',
                12345,
                'script',
                'Test summary'
            );

            expect(result.approved).toBe(true);
            expect(result.reason).toBe('no_telegram');
        });
    });

    // =====================================================
    // User Approval Handling
    // =====================================================
    describe('User Approval Handling', () => {
        it('should handle user approval callback', async () => {
            // Start approval request (don't await - it waits for timeout)
            const requestPromise = service.requestApproval(
                'job_abc',
                12345,
                'script',
                'Review this script'
            );

            // Verify message was sent
            expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
                12345,
                expect.stringContaining('Script Ready for Review')
            );

            // Simulate user approval
            await service.handleCallback('job_abc', 'script', true);

            // Get result
            const result = await requestPromise;
            expect(result.approved).toBe(true);
            expect(result.reason).toBe('user_approved');
        });

        it('should handle user rejection with feedback', async () => {
            const requestPromise = service.requestApproval(
                'job_reject',
                12345,
                'visuals',
                'Check these images'
            );

            // Simulate user rejection with feedback
            await service.handleCallback('job_reject', 'visuals', false, 'Make it more colorful');

            const result = await requestPromise;
            expect(result.approved).toBe(false);
            expect(result.reason).toBe('user_rejected');
            expect(result.feedback).toBe('Make it more colorful');
        });
    });

    // =====================================================
    // Pending State Management
    // =====================================================
    describe('Pending State', () => {
        it('should track pending approvals', async () => {
            // Start but don't await
            service.requestApproval('job_pending', 12345, 'script', 'Summary');

            // Should be pending
            expect(service.isPending('job_pending', 'script')).toBe(true);

            // Approve it
            await service.handleCallback('job_pending', 'script', true);

            // Should no longer be pending
            expect(service.isPending('job_pending', 'script')).toBe(false);
        });

        it('should return false for non-pending callback', async () => {
            const result = await service.handleCallback('nonexistent_job', 'script', true);
            expect(result).toBe(false);
        });
    });

    // =====================================================
    // Message Content
    // =====================================================
    describe('Message Content', () => {
        it('script checkpoint should show 📝 emoji', async () => {
            service.requestApproval('job_msg', 12345, 'script', 'Summary');

            expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
                12345,
                expect.stringContaining('📝')
            );
        });

        it('visuals checkpoint should show 🎨 emoji', async () => {
            service.requestApproval('job_vis', 12345, 'visuals', 'Image summary');

            expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
                12345,
                expect.stringContaining('🎨')
            );
        });

        it('message should include timeout warning', async () => {
            service.requestApproval('job_time', 12345, 'script', 'Summary');

            expect(mockTelegramService.sendMessage).toHaveBeenCalledWith(
                12345,
                expect.stringContaining('Auto-approves in 60 seconds')
            );
        });
    });

    // =====================================================
    // Edge Cases
    // =====================================================
    describe('Edge Cases', () => {
        it('should handle empty summary', async () => {
            const requestPromise = service.requestApproval('job_empty', 12345, 'script', '');
            await service.handleCallback('job_empty', 'script', true);
            const result = await requestPromise;
            expect(result.approved).toBe(true);
        });

        it('should handle very long summary', async () => {
            const longSummary = 'A'.repeat(5000);
            const requestPromise = service.requestApproval('job_long', 12345, 'script', longSummary);
            await service.handleCallback('job_long', 'script', true);
            const result = await requestPromise;
            expect(result.approved).toBe(true);
        });

        it('cleanup should remove old approvals', () => {
            // This is a basic test - cleanup removes entries older than 10 minutes
            service.cleanup();
            // Should not throw
        });
    });
});
