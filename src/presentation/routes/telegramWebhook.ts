import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
import { ApprovalService } from '../../application/ApprovalService';
import { asyncHandler, UnauthorizedError } from '../middleware/errorHandler';
import { ChatService } from '../services/ChatService';
import { getConfig } from '../../config';
import { isLinkedInRequest, extractRawNote, createLinkedInDraft, LinkedInDraft, assemblePostContent } from '../../domain/entities/LinkedInDraft';
import { GptLinkedInDraftService } from '../../infrastructure/linkedin/GptLinkedInDraftService';
import { WebhookLinkedInPosterService } from '../../infrastructure/linkedin/WebhookLinkedInPosterService';

/**
 * In-memory storage for pending LinkedIn drafts awaiting "post" command.
 * Key: chatId, Value: most recent draft
 */
const pendingLinkedInDrafts: Map<number, LinkedInDraft> = new Map();

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
    const telegramService = new ChatService(config.telegramBotToken);

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
    telegramService: ChatService,
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
            const job = await jobManager.createJob({
                sourceAudioUrl,
                targetDurationRange: { min: 10, max: 90 },
                description: message.caption, // Instructions from the user
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
        const lowerText = text.toLowerCase().trim();

        // Ignore commands like /start, /help
        if (text.startsWith('/')) {
            if (text === '/start' || text === '/help') {
                await telegramService.sendMessage(chatId,
                    `🎙️ *VoiceGen Bot*\n\n` +
                    `Send me:\n` +
                    `• 🎤 *Voice note* - I'll transcribe and create a reel\n` +
                    `• 📝 *Text prompt* - Describe your reel idea\n\n` +
                    `*During approval:*\n` +
                    `• *approve* - Continue processing\n` +
                    `• *reject [feedback]* - Regenerate with your feedback\n\n` +
                    `Example text prompts:\n` +
                    `_"Create a motivational reel about discipline"_\n` +
                    `_"Tell the story of Ekalavya from Mahabharata"_`
                );
            }
            return;
        }

        // Check for approval responses (handled by ApprovalService via orchestrator)
        if (lowerText === 'approve' || lowerText === 'yes' || lowerText === 'ok') {
            // Get latest job for this chat and approve it
            const lastJob = await jobManager.getLastJobForUser(chatId);
            if (lastJob && orchestrator.approvalService) {
                await orchestrator.approvalService.handleCallback(lastJob.id, 'script', true);
                await orchestrator.approvalService.handleCallback(lastJob.id, 'visuals', true);
            } else {
                await telegramService.sendMessage(chatId, '⚠️ No pending approval found.');
            }
            return;
        }

        // Check for rejection responses
        if (lowerText.startsWith('reject') || lowerText.startsWith('no') || lowerText.startsWith('change')) {
            const feedback = text.replace(/^(reject|no|change)/i, '').trim() || 'Please make it better';
            const lastJob = await jobManager.getLastJobForUser(chatId);
            if (lastJob && orchestrator.approvalService) {
                await orchestrator.approvalService.handleCallback(lastJob.id, 'script', false, feedback);
                await orchestrator.approvalService.handleCallback(lastJob.id, 'visuals', false, feedback);
            } else {
                await telegramService.sendMessage(chatId, '⚠️ No pending approval found.');
            }
            return;
        }

        // LINKEDIN POST COMMAND - Publish pending draft to LinkedIn
        if (lowerText === 'post' || lowerText === 'publish') {
            const pendingDraft = pendingLinkedInDrafts.get(chatId);
            if (!pendingDraft) {
                await telegramService.sendMessage(chatId, '⚠️ No pending LinkedIn draft found. Generate one first with: _linkedin [your raw thoughts]_');
                return;
            }

            try {
                const config = getConfig();
                if (!config.linkedinWebhookUrl || !config.linkedinWebhookApiKey) {
                    await telegramService.sendMessage(chatId, '❌ LinkedIn posting not configured. Missing webhook URL or API key.');
                    return;
                }

                await telegramService.sendMessage(chatId, '📤 *Publishing to LinkedIn...*');

                const posterService = new WebhookLinkedInPosterService(config.linkedinWebhookUrl, config.linkedinWebhookApiKey);
                const content = assemblePostContent(pendingDraft);

                const result = await posterService.postToLinkedIn({
                    type: 'ARTICLE',
                    content,
                    visibility: 'PUBLIC',
                    media: {
                        originalUrl: 'https://www.linkedin.com/in/yamigopal/',
                        title: pendingDraft.hook,
                        description: pendingDraft.coreTension,
                        thumbnail: {
                            fileName: '',
                            data: null
                        }
                    }
                });

                if (result.success) {
                    pendingLinkedInDrafts.delete(chatId);
                    await telegramService.sendMessage(chatId, `✅ *Posted to LinkedIn!*\n\n${result.postId ? `Post ID: \`${result.postId}\`` : 'Check your LinkedIn profile.'}`); console.log(`[Telegram] LinkedIn post published for chat ${chatId}`);
                } else {
                    await telegramService.sendMessage(chatId, `❌ Failed to post: ${result.error}`);
                }
            } catch (error) {
                console.error('[Telegram] LinkedIn posting failed:', error);
                await telegramService.sendMessage(chatId, `❌ Failed to post: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
            return;
        }

        // LINKEDIN PATH - Check if this is a LinkedIn draft request
        if (isLinkedInRequest(text)) {
            console.log(`[Telegram] LinkedIn draft request from chat ${chatId}`);

            try {
                const rawNote = extractRawNote(text);
                if (!rawNote.trim()) {
                    await telegramService.sendMessage(chatId,
                        '📝 *LinkedIn Draft*\n\nPlease include your raw thoughts after "linkedin".\n\nExample: _linkedin Most founders confuse hustle with actual progress_'
                    );
                    return;
                }

                await telegramService.sendMessage(chatId, '📝 *Generating LinkedIn draft...*\n\nAnalyzing your thoughts...');

                const config = getConfig();
                const linkedInService = new GptLinkedInDraftService(config.openaiApiKey, config.openaiModel);
                const draftContent = await linkedInService.generateDraftContent(rawNote);

                // Create full draft entity
                const draft = createLinkedInDraft(uuidv4(), { chatId, rawNote }, draftContent);

                // Store draft for "post" command
                pendingLinkedInDrafts.set(chatId, draft);

                // Format response for user
                const response = formatLinkedInDraft(draft);
                await telegramService.sendMessage(chatId, response);

                console.log(`[Telegram] LinkedIn draft ${draft.id} stored and sent to chat ${chatId}`);

            } catch (error) {
                console.error('[Telegram] LinkedIn draft generation failed:', error);
                await telegramService.sendMessage(chatId,
                    `❌ Failed to generate LinkedIn draft: ${error instanceof Error ? error.message : 'Unknown error'}`
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

/**
 * Formats a LinkedIn draft for Telegram display.
 */
function formatLinkedInDraft(draft: import('../../domain/entities/LinkedInDraft').LinkedInDraft): string {
    const bullets = draft.outlineBullets.map((b, i) => `  ${i + 1}. ${b}`).join('\n');
    const closers = draft.closerOptions.map((c, i) => `  ${i + 1}. ${c}`).join('\n');

    return `📝 *LinkedIn Draft*

*HOOK:*
_${draft.hook}_

*CORE TENSION:*
${draft.coreTension}

*OUTLINE:*
${bullets}

*CLOSER OPTIONS:*
${closers}

*HASHTAGS:*
${draft.hashtags.join(' ')}

---
Draft ID: \`${draft.id}\`
Reply "schedule" to queue for posting.`;
}
