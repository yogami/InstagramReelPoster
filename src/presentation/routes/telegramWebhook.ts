import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { asyncHandler } from '../middleware/errorHandler';
import { TelegramService } from '../services/TelegramService';
import { getConfig } from '../../config';

/**
 * Creates Telegram webhook routes.
 * This is an optional thin wrapper that converts Telegram events into /process-reel calls.
 */
export function createTelegramWebhookRoutes(
    jobManager: JobManager,
    orchestrator: ReelOrchestrator
): Router {
    const router = Router();
    const config = getConfig();
    const telegramService = new TelegramService(config.telegramBotToken);

    /**
     * POST /telegram-webhook
     * 
     * Receives Telegram updates and processes voice messages.
     */
    router.post(
        '/telegram-webhook',
        asyncHandler(async (req: Request, res: Response) => {
            const update = req.body;

            // Acknowledge receipt immediately to avoid timeouts
            res.status(200).json({ ok: true });

            // Process in background
            try {
                await processUpdate(update, jobManager, orchestrator, telegramService, config.makeWebhookUrl);
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
    orchestrator: ReelOrchestrator,
    telegramService: TelegramService,
    makeWebhookUrl: string
): Promise<void> {
    // Check for voice or audio message
    const message = update.message;
    if (!message) {
        return;
    }

    const voice = message.voice || message.audio;
    if (!voice) {
        // console.log('Received non-voice message, ignoring');
        return;
    }

    const fileId = voice.file_id;
    const chatId = message.chat.id;

    console.log(`Received voice message from chat ${chatId}, file_id: ${fileId}`);

    try {
        // 1. Get file URL from Telegram
        const sourceAudioUrl = await telegramService.getFileUrl(fileId);
        console.log(`Resolved Telegram file URL: ${sourceAudioUrl}`);

        // 2. Create and start job
        // Sanitize mood from caption if present (optional feature for later)
        const moodOverrides = message.caption ? [message.caption] : undefined;

        const job = jobManager.createJob({
            sourceAudioUrl,
            targetDurationRange: { min: 10, max: 90 }, // Defaults from app config usually, but hardcoded here for simplicity or passed via config
            moodOverrides,
            callbackUrl: makeWebhookUrl,
        });

        const jobId = job.id;
        console.log(`Started ReelJob ${jobId} for Telegram message`);

        // Start processing (fire and forget)
        orchestrator.processJob(jobId).catch((err) => {
            console.error(`Job ${jobId} failed in background:`, err);
        });

    } catch (error) {
        console.error('Failed to process Telegram voice message:', error);
    }
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
    caption?: string;
    voice?: {
        file_id: string;
        duration: number;
    };
    audio?: {
        file_id: string;
        duration: number;
    };
}
