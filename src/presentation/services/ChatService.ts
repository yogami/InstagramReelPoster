import axios from 'axios';

export class ChatService {
    private readonly botToken: string;
    private readonly baseUrl: string;

    constructor(botToken: string) {
        this.botToken = botToken;
        this.baseUrl = `https://api.telegram.org/bot${botToken}`;
    }

    /**
     * Resolves a Telegram file_id to a downloadable URL and returns it.
     * Note: This returns the public Telegram file URL which includes the bot token.
     */
    async getFileUrl(fileId: string): Promise<string> {
        if (!this.botToken) {
            throw new Error('Telegram bot token not configured');
        }

        try {
            // 1. Get file path from Telegram API
            const response = await axios.get(`${this.baseUrl}/getFile`, {
                params: { file_id: fileId }
            });

            if (!response.data.ok || !response.data.result.file_path) {
                throw new Error('Failed to get file path from Telegram');
            }

            const filePath = response.data.result.file_path;

            // 2. Construct download URL
            // Format: https://api.telegram.org/file/bot<token>/<file_path>
            return `https://api.telegram.org/file/bot${this.botToken}/${filePath}`;
        } catch (error) {
            console.error('Error resolving Telegram file URL:', error);
            throw new Error(`Failed to resolve Telegram file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Sends a text message to a Telegram chat.
     */
    async sendMessage(chatId: number, text: string): Promise<void> {
        if (!this.botToken) {
            console.warn('Telegram bot token not configured, skipping message send');
            return;
        }

        try {
            // Ensure text is within limits
            const content = text.length > 4000 ? text.substring(0, 4000) + '... (truncated)' : text;

            await axios.post(`${this.baseUrl}/sendMessage`, {
                chat_id: chatId,
                text: content,
                parse_mode: 'Markdown'
            });
        } catch (error: any) {
            // Retry without Markdown if it fails (often due to unescaped characters in JSON)
            if (error.response?.status === 400) {
                try {
                    console.warn(`[ChatService] Markdown send failed, retrying as plain text...`);
                    const cleanText = text.replace(/[{}"\\]/g, ''); // Basic strip for safety
                    const safeContent = cleanText.length > 4000 ? cleanText.substring(0, 4000) + '...' : cleanText;

                    await axios.post(`${this.baseUrl}/sendMessage`, {
                        chat_id: chatId,
                        text: safeContent
                        // No parse_mode = Plain Text
                    });
                    return;
                } catch (retryError) {
                    console.error(`[ChatService] Retry failed:`, retryError);
                }
            }
            console.error(`Failed to send Telegram message to chat ${chatId}:`, error);
        }
    }
}
