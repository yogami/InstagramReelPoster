import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { asyncHandler, UnauthorizedError } from '../middleware/errorHandler';
import { TelegramService } from '../services/TelegramService';
import { getConfig } from '../../config';

/**
 * Middleware to validate Telegram webhook secret token.
 */
function validateTelegramSecret(secretToken: string) {
    return (req: Request, res: Response, next: NextFunction) => {
        if (!secretToken) {
            // If no secret is configured, skip validation (dev mode)
            return next();
        }

        const receivedToken = req.headers['x-telegram-bot-api-secret-token'];

        if (receivedToken !== secretToken) {
            console.warn('Invalid Telegram webhook secret token received');
            throw new UnauthorizedError('Invalid webhook secret');
        }

        next();
    };
}

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
     * Protected by secret token validation.
     */
    router.post(
        '/telegram-webhook',
        validateTelegramSecret(config.telegramWebhookSecret),
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
 * Supports BOTH voice messages AND text prompts.
 */
async function processUpdate(
    update: TelegramUpdate,
    jobManager: JobManager,
    orchestrator: ReelOrchestrator,
    telegramService: TelegramService,
    makeWebhookUrl: string
): Promise<void> {
    const message = update.message;
    if (!message) {
        return;
    }

    const chatId = message.chat.id;
    const voice = message.voice || message.audio;
    const text = message.text;

    // VOICE MESSAGE PATH
    if (voice) {
        const fileId = voice.file_id;
        console.log(`[Telegram] Voice message from chat ${chatId}, file_id: ${fileId}`);

        try {
            // 1. Get file URL from Telegram
            const sourceAudioUrl = await telegramService.getFileUrl(fileId);
            console.log(`[Telegram] Resolved file URL: ${sourceAudioUrl}`);

            // 2. Create and start job with audio
            const moodOverrides = message.caption ? [message.caption] : undefined;

            const job = await jobManager.createJob({
                sourceAudioUrl,
                targetDurationRange: { min: 10, max: 90 },
                moodOverrides,
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });

            console.log(`[Telegram] Started job ${job.id} for voice message`);

            // Acknowledge to user
            await telegramService.sendMessage(chatId, `🎬 *Voice received!* Processing reel...\n\nJob ID: \`${job.id}\``);

            // Start processing (fire and forget)
            orchestrator.processJob(job.id).catch((err) => {
                console.error(`Job ${job.id} failed:`, err);
                telegramService.sendMessage(chatId, `❌ Job failed: ${err.message || 'Unknown error'}`);
            });

        } catch (error) {
            console.error('[Telegram] Failed to process voice message:', error);
            await telegramService.sendMessage(chatId, `❌ Failed to process voice: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
    }

    // TEXT MESSAGE PATH
    if (text && text.trim().length > 0) {
        // Ignore commands like /start, /help
        if (text.startsWith('/')) {
            if (text === '/start' || text === '/help') {
                await telegramService.sendMessage(chatId,
                    `🎙️ *VoiceGen Bot*\n\n` +
                    `Send me:\n` +
                    `• 🎤 *Voice note* - I'll transcribe and create a reel\n` +
                    `• 📝 *Text prompt* - Describe your reel idea\n\n` +
                    `Example text prompts:\n` +
                    `_"Create a motivational reel about discipline"_\n` +
                    `_"Tell the story of Ekalavya from Mahabharata"_`
                );
            }
            return;
        }

        console.log(`[Telegram] Text message from chat ${chatId}: "${text.substring(0, 50)}..."`);

        try {
            // Create job with text as the transcript (bypasses transcription step)
            const job = await jobManager.createJob({
                transcript: text.trim(),
                targetDurationRange: { min: 10, max: 90 },
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });

            console.log(`[Telegram] Started job ${job.id} for text prompt`);

            // Acknowledge to user
            await telegramService.sendMessage(chatId, `🎬 *Text received!* Processing reel...\n\nPrompt: _"${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"_\n\nJob ID: \`${job.id}\``);

            // Start processing (fire and forget)
            orchestrator.processJob(job.id).catch((err) => {
                console.error(`Job ${job.id} failed:`, err);
                telegramService.sendMessage(chatId, `❌ Job failed: ${err.message || 'Unknown error'}`);
            });

        } catch (error) {
            console.error('[Telegram] Failed to process text message:', error);
            await telegramService.sendMessage(chatId, `❌ Failed to process text: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
    }

    // Unsupported message type
    console.log(`[Telegram] Ignoring unsupported message type from chat ${chatId}`);
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
    text?: string;  // Text message content
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
