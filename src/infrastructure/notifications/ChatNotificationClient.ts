import { INotificationClient } from '../../domain/ports/INotificationClient';
import { ChatService } from '../../presentation/services/ChatService';

/**
 * Adapter that implements INotificationClient using Chat.
 */
export class ChatNotificationClient implements INotificationClient {
    constructor(private readonly telegramService: ChatService) { }

    async sendNotification(userId: number, message: string): Promise<void> {
        await this.telegramService.sendMessage(userId, message);
    }
}
