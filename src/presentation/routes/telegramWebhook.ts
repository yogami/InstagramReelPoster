import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { JobManager } from '../../application/JobManager';
import { ReelOrchestrator } from '../../application/ReelOrchestrator';
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
 */
export function createTelegramWebhookRoutes(
    jobManager: JobManager,
    orchestrator: ReelOrchestrator
): Router {
    const router = Router();
    const config = getConfig();
    const telegramService = new ChatService(config.telegramBotToken);

    router.post(
        '/telegram-webhook',
        validateTelegramSecret(config.telegramWebhookSecret),
        asyncHandler(async (req: Request, res: Response) => {
            const update = req.body;
            res.status(200).json({ ok: true });

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
    telegramService: ChatService,
    makeWebhookUrl: string
): Promise<void> {
    const message = update.message;
    if (!message) return;

    const chatId = message.chat.id;
    const voice = message.voice || message.audio;
    const text = message.text;

    // VOICE MESSAGE PATH
    if (voice) {
        const fileId = voice.file_id;
        try {
            const sourceAudioUrl = await telegramService.getFileUrl(fileId);
            const job = await jobManager.createJob({
                sourceAudioUrl,
                targetDurationRange: { min: 10, max: 90 },
                description: message.caption,
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });
            await telegramService.sendMessage(chatId, `🎬 *Voice received!* Processing reel...\n\nJob ID: \`${job.id}\``);
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
    if (!text || text.trim().length === 0) return;

    const trimmedText = text.trim();
    const lowerText = trimmedText.toLowerCase();

    // 1. SYSTEM COMMANDS
    if (trimmedText === '/start' || trimmedText === '/help') {
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
        return;
    }

    // 2. AGENT COMMAND
    if (trimmedText.startsWith('/agent')) {
        const prompt = trimmedText.replace('/agent', '').trim();
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

    // 3. REEL COMMAND
    if (trimmedText.startsWith('/reel')) {
        const prompt = trimmedText.replace('/reel', '').trim();
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

    // 4. APPROVAL FLOW
    if (lowerText === 'approve' || lowerText === 'yes' || lowerText === 'ok') {
        const lastJob = await jobManager.getLastJobForUser(chatId);
        if (lastJob && orchestrator.approvalService) {
            await orchestrator.approvalService.handleCallback(lastJob.id, 'script', true);
            await orchestrator.approvalService.handleCallback(lastJob.id, 'visuals', true);
        } else {
            await telegramService.sendMessage(chatId, '⚠️ No pending approval found.');
        }
        return;
    }

    if (lowerText.startsWith('reject') || lowerText.startsWith('no') || lowerText.startsWith('change')) {
        const feedback = trimmedText.replace(/^(reject|no|change)/i, '').trim() || 'Please make it better';
        const lastJob = await jobManager.getLastJobForUser(chatId);
        if (lastJob && orchestrator.approvalService) {
            await orchestrator.approvalService.handleCallback(lastJob.id, 'script', false, feedback);
            await orchestrator.approvalService.handleCallback(lastJob.id, 'visuals', false, feedback);
        } else {
            await telegramService.sendMessage(chatId, '⚠️ No pending approval found.');
        }
        return;
    }

    // 5. LINKEDIN DRAFT
    if (isLinkedInRequest(trimmedText)) {
        try {
            const rawNote = extractRawNote(trimmedText);
            if (!rawNote.trim()) {
                await telegramService.sendMessage(chatId, '📝 *LinkedIn Draft*\n\nPlease include your raw thoughts after "linkedin".');
                return;
            }
            await telegramService.sendMessage(chatId, '📝 *Generating LinkedIn draft...*');
            const config = getConfig();
            const linkedInService = new GptLinkedInDraftService(config.llmApiKey, config.llmModel);
            const draftContent = await linkedInService.generateDraftContent(rawNote);
            const draft = createLinkedInDraft(uuidv4(), { chatId, rawNote }, draftContent);
            pendingLinkedInDrafts.set(chatId, draft);
            await telegramService.sendMessage(chatId, formatLinkedInDraft(draft));
        } catch (error) {
            console.error('[Telegram] LinkedIn draft failed:', error);
            await telegramService.sendMessage(chatId, `❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
    }

    // 6. LINKEDIN POST
    if (lowerText === 'post' || lowerText === 'publish') {
        const pendingDraft = pendingLinkedInDrafts.get(chatId);
        if (!pendingDraft) {
            await telegramService.sendMessage(chatId, '⚠️ No pending LinkedIn draft found.');
            return;
        }
        try {
            const config = getConfig();
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
                    thumbnail: { fileName: '', data: null }
                }
            });
            if (result.success) {
                pendingLinkedInDrafts.delete(chatId);
                await telegramService.sendMessage(chatId, `✅ *Posted to LinkedIn!*`);
            } else {
                await telegramService.sendMessage(chatId, `❌ Failed to post: ${result.error}`);
            }
        } catch (error) {
            console.error('[Telegram] LinkedIn posting failed:', error);
            await telegramService.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return;
    }

    // 7. YOUTUBE SHORT
    if (YouTubeScriptParser.isYouTubeRequest(trimmedText)) {
        try {
            const youtubeInput = YouTubeScriptParser.parse(trimmedText);
            await telegramService.sendMessage(chatId, `🎬 *YouTube Short Script Received!* Processing...`);
            const job = await jobManager.createJob({
                transcript: youtubeInput.scenes.map(s => s.narration).join(' '),
                youtubeShortInput: youtubeInput,
                forceMode: 'youtube-short',
                targetDurationRange: { min: 15, max: youtubeInput.totalDurationSeconds + 10 },
                callbackUrl: makeWebhookUrl,
                telegramChatId: chatId,
            });
            orchestrator.processJob(job.id).catch((err) => {
                console.error(`YouTube Short failed:`, err);
                telegramService.sendMessage(chatId, `❌ Job failed: ${err.message}`);
            });
        } catch (error) {
            console.error('[Telegram] YouTube Short failed:', error);
            await telegramService.sendMessage(chatId, `❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
        return;
    }

    // FALLBACK
    await telegramService.sendMessage(chatId,
        `🤔 I didn't catch that intent.\n\n` +
        `To create a **Reel**, use:\n` +
        `\`/reel ${trimmedText.substring(0, 30)}...\`\n\n` +
        `To trigger an **Agent**, use:\n` +
        `\`/agent ${trimmedText.substring(0, 30)}...\``
    );
}

interface TelegramUpdate {
    update_id: number;
    message?: TelegramMessage;
}

interface TelegramMessage {
    message_id: number;
    chat: { id: number; type: string };
    text?: string;
    caption?: string;
    voice?: { file_id: string; duration: number };
    audio?: { file_id: string; duration: number };
}

function formatLinkedInDraft(draft: LinkedInDraft): string {
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
Reply "post" to publish.`;
}
