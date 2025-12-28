import { VoiceoverService } from '../../../src/application/services/VoiceoverService';
import { ITTSClient } from '../../../src/domain/ports/ITTSClient';

describe('VoiceoverService', () => {
    let service: VoiceoverService;
    let mockPrimaryTTS: jest.Mocked<ITTSClient>;
    let mockFallbackTTS: jest.Mocked<ITTSClient>;

    beforeEach(() => {
        mockPrimaryTTS = {
            synthesize: jest.fn(),
        } as unknown as jest.Mocked<ITTSClient>;

        mockFallbackTTS = {
            synthesize: jest.fn(),
        } as unknown as jest.Mocked<ITTSClient>;

        service = new VoiceoverService(mockPrimaryTTS, mockFallbackTTS);
    });

    describe('synthesize', () => {
        it('should use primary TTS client when successful', async () => {
            mockPrimaryTTS.synthesize.mockResolvedValue({
                audioUrl: 'https://example.com/audio.mp3',
                durationSeconds: 30,
            });

            const result = await service.synthesize('Test text', 30);

            expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith('Test text', { voiceId: undefined });
            expect(mockFallbackTTS.synthesize).not.toHaveBeenCalled();
            expect(result.voiceoverUrl).toBe('https://example.com/audio.mp3');
            expect(result.voiceoverDuration).toBe(30);
        });

        it('should fall back to secondary TTS when primary fails', async () => {
            mockPrimaryTTS.synthesize.mockRejectedValue(new Error('Primary failed'));
            mockFallbackTTS.synthesize.mockResolvedValue({
                audioUrl: 'https://fallback.com/audio.mp3',
                durationSeconds: 30,
            });

            const result = await service.synthesize('Test text', 30);

            expect(mockPrimaryTTS.synthesize).toHaveBeenCalled();
            expect(mockFallbackTTS.synthesize).toHaveBeenCalled();
            expect(result.voiceoverUrl).toBe('https://fallback.com/audio.mp3');
        });

        it('should pass voiceId to TTS clients', async () => {
            mockPrimaryTTS.synthesize.mockResolvedValue({
                audioUrl: 'https://example.com/audio.mp3',
                durationSeconds: 30,
            });

            await service.synthesize('Test text', 30, 'voice-123');

            expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith('Test text', { voiceId: 'voice-123' });
        });

        it('should throw error when both TTS clients fail', async () => {
            mockPrimaryTTS.synthesize.mockRejectedValue(new Error('Primary failed'));
            service = new VoiceoverService(mockPrimaryTTS); // No fallback

            await expect(service.synthesize('Test text', 30)).rejects.toThrow('Primary failed');
        });
    });
});
