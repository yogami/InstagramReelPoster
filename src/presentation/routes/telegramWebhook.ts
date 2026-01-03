import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
// import { ApprovalService } from '../../application/ApprovalService'; // Unused
import { asyncHandler, UnauthorizedError } from '../middleware/errorHandler';
import { ChatService } from '../services/ChatService';
import { getConfig } from '../../config';
import { isLinkedInRequest, extractRawNote, createLinkedInDraft, LinkedInDraft, assemblePostContent } from '../../domain/entities/LinkedInDraft';
import { GptLinkedInDraftService } from '../../infrastructure/linkedin/GptLinkedInDraftService';
import { WebhookLinkedInPosterService } from '../../infrastructure/linkedin/WebhookLinkedInPosterService';
import { YouTubeScriptParser } from '../../infrastructure/youtube/YouTubeScriptParser';

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
/* eslint-disable max-lines-per-function */
/* eslint-disable complexity */
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
                    `*Commands:*\n` +
                    `• /reel <prompt> - Create a new Instagram Reel\n` +
                    `• /agent <task> - Trigger a local agent task\n` +
                    `• /linkedin <note> - Draft a LinkedIn post\n\n` +
                    `*Other:* \n` +
                    `• Send a **Voice Note** to auto-create a reel\n` +
                    `• Reply *approve/reject* for pending reviews`
                );
            }
        }

        // AGENT COMMAND - Remote Director
        if (text.startsWith('/agent')) {
            const prompt = text.replace('/agent', '').trim();

            if (!prompt) {
                await telegramService.sendMessage(chatId, '🤖 *Agent Director*\n\nUsage: `/agent <task description>`\n\nExample: `/agent Fix the bug in ReelPoster`');
                return;
            }

            try {
                const config = getConfig();
                if (!config.cloudHubUrl) {
                    await telegramService.sendMessage(chatId, '❌ Agent Cloud Hub not configured.');
                    return;
                }

                console.log(`[Telegram] Forwarding agent task from ${chatId}: ${prompt}`);
                await telegramService.sendMessage(chatId, '🤖 *Task Received!*\n\nQueuing for local agent...');

                await axios.post(`${config.cloudHubUrl}/api/tasks`, {
                    task: prompt,
                    requester: `Telegram User ${chatId}`
                });

                await telegramService.sendMessage(chatId, '✅ *Task Queued!* The local agent will pick this up shortly.');

            } catch (error: any) {
                console.error('[Telegram] Failed to queue agent task:', error);
                await telegramService.sendMessage(chatId, `❌ Failed to queue task: ${error.message}`);
            }
            return;
        }

        return;
    }

    // Ensure text is defined before processing further text-based commands
    if (!text || text.trim().length === 0) {
        return;
    }

    const lowerText = text.toLowerCase().trim();

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

    // YOUTUBE SHORT PATH - Check if this is a YouTube Short script
    if (YouTubeScriptParser.isYouTubeRequest(text)) {
        console.log(`[Telegram] YouTube Short script request from chat ${chatId}`);

        try {
            const youtubeInput = YouTubeScriptParser.parse(text);
            const youtubeScriptPlan = YouTubeScriptParser.toScriptPlan(youtubeInput);

            await telegramService.sendMessage(chatId,
                `🎬 *YouTube Short Script Received!*\n\n` +
                `Title: _${youtubeInput.title}_\n` +
                `Duration: ${youtubeInput.totalDurationSeconds}s\n` +
                `Scenes: ${youtubeInput.scenes.length}\n\n` +
                `Processing video...`
            );

            // Create job with YouTube Short input
            const job = await jobManager.createJob({
                transcript: youtubeInput.scenes.map(s => s.narration).join(' '),
                youtubeShortInput: youtubeInput,
                forceMode: 'youtube-short',
                targetDurationRange: { min: 15, max: youtubeInput.totalDurationSeconds + 10 },
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });

            console.log(`[Telegram] Started YouTube Short job ${job.id}`);

            // Process job (fire and forget)
            orchestrator.processJob(job.id).catch((err) => {
                console.error(`YouTube Short job ${job.id} failed:`, err);
                telegramService.sendMessage(chatId, `❌ YouTube Short failed: ${err.message || 'Unknown error'}`);
            });

        } catch (error) {
            console.error('[Telegram] YouTube Short parsing failed:', error);
            await telegramService.sendMessage(chatId,
                `❌ Failed to parse YouTube script: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
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
            const linkedInService = new GptLinkedInDraftService(config.llmApiKey, config.llmModel);
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

    // REEL COMMAND (Explicit)
    if (text.startsWith('/reel')) {
        const prompt = text.replace('/reel', '').trim();
        if (!prompt) {
            await telegramService.sendMessage(chatId, 'Usage: `/reel <description of video>`');
            return;
        }

        try {
            const job = await jobManager.createJob({
                transcript: prompt,
                targetDurationRange: { min: 10, max: 90 },
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });
            console.log(`[Telegram] Started job ${job.id} via /reel command`);
            await telegramService.sendMessage(chatId, `🎬 *Starting Reel...*\n\nPrompt: _"${prompt.substring(0, 50)}..."_\nJob ID: \`${job.id}\``);

            orchestrator.processJob(job.id).catch((err) => {
                console.error(`Job ${job.id} failed:`, err);
                telegramService.sendMessage(chatId, `❌ Job failed: ${err.message}`);
            });

        } catch (error) {
            console.error('[Telegram] Failed to process /reel:', error);
            await telegramService.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
        return;
    }

    // FALLBACK / GUIDANCE
    // If we reached here, the text didn't match any specific intent.
    // Previously we assumed it was a prompt. Now we guide the user to avoid accidents.

    console.log(`[Telegram] Unhandled text from ${chatId}: "${text.substring(0, 20)}..."`);

    await telegramService.sendMessage(chatId,
        `🤔 I didn't catch that intent.\n\n` +
        `To create a **Reel**, use:\n` +
        `\`/reel ${text.substring(0, 50)}...\`\n\n` +
        `To trigger an **Agent**, use:\n` +
        `\`/agent ${text.substring(0, 50)}...\``
    );
    return;
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
