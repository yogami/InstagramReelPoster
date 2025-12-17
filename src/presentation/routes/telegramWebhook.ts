import { Router, Request, Response } from 'express';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { asyncHandler, BadRequestError } from '../middleware/errorHandler';

/**
 * Creates Telegram webhook routes.
 * This is an optional thin wrapper that converts Telegram events into /process-reel calls.
 */
export function createTelegramWebhookRoutes(
    jobManager: JobManager,
    orchestrator: ReelOrchestrator
): Router {
    const router = Router();

    /**
     * POST /telegram-webhook
     * 
     * Receives Telegram updates and processes voice messages.
     */
    router.post(
        '/telegram-webhook',
        asyncHandler(async (req: Request, res: Response) => {
            const update = req.body;

            // Acknowledge receipt immediately
            res.status(200).json({ ok: true });

            // Process in background
            try {
                await processUpdate(update, jobManager, orchestrator);
            } catch (error) {
                console.error('Telegram webhook processing error:', error);
            }
        })
    );

    return router;
}

/**
 * Processes a Telegram update.
 */
async function processUpdate(
    update: TelegramUpdate,
    jobManager: JobManager,
    orchestrator: ReelOrchestrator
): Promise<void> {
    // Check for voice or audio message
    const message = update.message;
    if (!message) {
        return;
    }

    const voice = message.voice || message.audio;
    if (!voice) {
        console.log('Received non-voice message, ignoring');
        return;
    }

    // Get file URL from Telegram
    // Note: In production, you'd need to call Telegram's getFile API
    // to get the actual file URL with the bot token
    const fileId = voice.file_id;
    const chatId = message.chat.id;

    console.log(`Received voice message from chat ${chatId}, file_id: ${fileId}`);

    // TODO: In production, call Telegram Bot API to get file URL:
    // const fileUrl = await getTelegramFileUrl(fileId);

    // For now, we'll expect the audio URL to be provided differently
    // This is a placeholder that shows the integration pattern
    console.log('Telegram webhook received. Integration requires Telegram Bot API setup.');
}

/**
 * Telegram update types (minimal definitions).
 */
interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}

interface TelegramMessage {
    message_id: number;
    chat: {
        id: number;
        type: string;
    };
    voice?: {
        file_id: string;
        duration: number;
    };
    audio?: {
        file_id: string;
        duration: number;
    };
}
