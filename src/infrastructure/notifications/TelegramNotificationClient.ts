import { INotificationClient } from '../../domain/ports/INotificationClient';
import { TelegramService } from '../../presentation/services/TelegramService';

/**
 * Adapter that implements INotificationClient using Telegram.
 */
export class TelegramNotificationClient implements INotificationClient {
    constructor(private readonly telegramService: TelegramService) { }

    async sendNotification(userId: number, message: string): Promise<void> {
        await this.telegramService.sendMessage(userId, message);
    }
}
