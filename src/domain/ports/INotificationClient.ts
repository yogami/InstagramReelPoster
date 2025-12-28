/**
 * Port for sending notifications to users.
 * Implementations: ChatNotificationClient
 */
export interface INotificationClient {
    /**
     * Sends a notification message to a user.
     * @param userId User identifier (e.g., Telegram chat ID)
     * @param message Message text (supports Markdown)
     */
    sendNotification(userId: number, message: string): Promise<void>;
}
