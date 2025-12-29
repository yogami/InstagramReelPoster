import { PromoAssetService } from '../../src/application/services/PromoAssetService';
import { ITtsClient } from '../../src/domain/ports/ITtsClient';

describe('TTS Priority Logic (Unit)', () => {
    let service: any; // Use any to access private methods
    let mockPrimaryTTS: jest.Mocked<ITtsClient>;
    let mockFallbackTTS: jest.Mocked<ITtsClient>;
    let mockDeps: any;

    beforeEach(() => {
        mockPrimaryTTS = {
            synthesize: jest.fn(),
        } as any;

        mockFallbackTTS = {
            synthesize: jest.fn(),
        } as any;

        mockDeps = {
            ttsClient: mockPrimaryTTS,
            fallbackTtsClient: mockFallbackTTS,
            jobManager: {
                updateStatus: jest.fn(),
                updateJob: jest.fn(),
            },
            musicSelector: {},
            storageClient: {
                uploadAudio: jest.fn().mockResolvedValue({ url: 'http://cloudinary.com/audio.mp3' }),
                uploadImage: jest.fn(),
            },
            fallbackImageClient: {},
        };

        service = new PromoAssetService(mockDeps);
    });

    test('Should prioritize Primary Client (Voice Cloning) when it succeeds', async () => {
        // Arrange
        mockPrimaryTTS.synthesize.mockResolvedValue({
            audioUrl: 'primary_url',
            durationSeconds: 10
        });

        // Act
        const result = await service.synthesizeWithAdjustment('test text', 10);

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith(expect.any(String), { voiceId: undefined });
        expect(mockFallbackTTS.synthesize).not.toHaveBeenCalled();
        expect(result.voiceoverUrl).toBe('primary_url');
    });

    test('Should user Fallback Client ONLY when Primary fails', async () => {
        // Arrange
        mockPrimaryTTS.synthesize.mockRejectedValue(new Error('Voice Cloning Rate Limit'));
        mockFallbackTTS.synthesize.mockResolvedValue({
            audioUrl: 'fallback_url',
            durationSeconds: 10
        });

        // Act
        const result = await service.synthesizeWithAdjustment('test text', 10);

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith(expect.any(String), { voiceId: undefined });
        expect(mockFallbackTTS.synthesize).toHaveBeenCalledWith(expect.any(String), { voiceId: undefined });
        expect(result.voiceoverUrl).toBe('fallback_url');
    });

    test('Should handle speed adjustment failures gracefully', async () => {
        // Arrange: Primary succeeds on first pass (but too long), fails on speed adjustment
        mockPrimaryTTS.synthesize
            .mockResolvedValueOnce({ audioUrl: 'primary_normal', durationSeconds: 20 }) // 1st call
            .mockRejectedValueOnce(new Error('Speed adjust failed')); // 2nd call (speed)

        // Fallback succeeds on speed adjustment
        mockFallbackTTS.synthesize.mockResolvedValue({
            audioUrl: 'fallback_sped_up',
            durationSeconds: 10
        });

        // Act
        const result = await service.synthesizeWithAdjustment('test text that is too long for target duration', 5); // Forces speed adjustment

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledTimes(2); // Normal + Speed
        expect(mockFallbackTTS.synthesize).toHaveBeenCalledTimes(1); // Speed fallback
        expect(result.voiceoverUrl).toBe('fallback_sped_up');
    });
});
