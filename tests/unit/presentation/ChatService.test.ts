
import axios from 'axios';
import { ChatService } from '../../../src/presentation/services/ChatService';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ChatService', () => {
    let service: ChatService;
    const botToken = 'test_bot_token';
    const chatId = 12345;

    beforeEach(() => {
        service = new ChatService(botToken);
        jest.clearAllMocks();
    });

    describe('sendMessage', () => {
        it('should send normal message with Markdown', async () => {
            mockedAxios.post.mockResolvedValue({ data: { ok: true } });

            await service.sendMessage(chatId, 'Hello *World*');

            expect(mockedAxios.post).toHaveBeenCalledWith(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                    chat_id: chatId,
                    text: 'Hello *World*',
                    parse_mode: 'Markdown'
                }
            );
        });

        it('should truncate message if too long', async () => {
            mockedAxios.post.mockResolvedValue({ data: { ok: true } });

            const longText = 'a'.repeat(4005);
            await service.sendMessage(chatId, longText);

            const expectedText = 'a'.repeat(4000) + '... (truncated)';
            expect(mockedAxios.post).toHaveBeenCalledWith(
                expect.stringContaining('/sendMessage'),
                expect.objectContaining({
                    text: expectedText
                })
            );
        });

        it('should retry as plain text on 400 error', async () => {
            // First call fails with 400
            mockedAxios.post.mockRejectedValueOnce({
                response: { status: 400, data: { description: 'Bad Request: can\'t parse entities' } }
            });
            // Second call succeeds
            mockedAxios.post.mockResolvedValueOnce({ data: { ok: true } });

            const invalidMarkdown = 'Broken_json: {"foo": "bar"}';

            await service.sendMessage(chatId, invalidMarkdown);

            expect(mockedAxios.post).toHaveBeenCalledTimes(2);

            // First call with Markdown
            expect(mockedAxios.post).toHaveBeenNthCalledWith(1,
                expect.any(String),
                expect.objectContaining({ parse_mode: 'Markdown' })
            );

            // Second call without Markdown and sanitization
            expect(mockedAxios.post).toHaveBeenNthCalledWith(2,
                expect.any(String),
                expect.objectContaining({
                    text: expect.stringContaining('Broken_json: foo: bar')
                })
            );
        });

        it('should fallback gracefully if retry also fails', async () => {
            // Both calls fail
            mockedAxios.post.mockRejectedValue({
                response: { status: 400 }
            });

            const invalidMarkdown = 'Test';
            await service.sendMessage(chatId, invalidMarkdown);

            expect(mockedAxios.post).toHaveBeenCalledTimes(2);
            // Function should not throw
        });
    });
});
