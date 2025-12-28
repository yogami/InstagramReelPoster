
import { ReelOrchestrator } from '../../src/application/ReelOrchestrator';
import { ITTSClient } from '../../src/domain/ports/ITTSClient';

describe('TTS Priority Logic (Unit)', () => {
    let orchestrator: any; // Use any to access private methods
    let mockPrimaryTTS: jest.Mocked<ITTSClient>;
    let mockFallbackTTS: jest.Mocked<ITTSClient>;
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
            fallbackTTSClient: mockFallbackTTS,
            // Minimal other deps to satisfy constructor if needed, or cast
            jobManager: {},
            transcriptionClient: {},
            llmClient: {},
            primaryImageClient: {},
            subtitlesClient: {},
            videoRenderer: {},
            musicSelector: {},
        };

        orchestrator = new ReelOrchestrator(mockDeps);
    });

    test('Should prioritize Primary Client (Fish Audio) when it succeeds', async () => {
        // Arrange
        mockPrimaryTTS.synthesize.mockResolvedValue({
            audioUrl: 'primary_url',
            durationSeconds: 10
        });

        // Act
        const result = await orchestrator.synthesizeWithAdjustment('test text', 10);

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith('test text', { voiceId: undefined });
        expect(mockFallbackTTS.synthesize).not.toHaveBeenCalled();
        expect(result.voiceoverUrl).toBe('primary_url');
    });

    test('Should user Fallback Client ONLY when Primary fails', async () => {
        // Arrange
        mockPrimaryTTS.synthesize.mockRejectedValue(new Error('Fish Audio Rate Limit'));
        mockFallbackTTS.synthesize.mockResolvedValue({
            audioUrl: 'fallback_url',
            durationSeconds: 10
        });

        // Act
        const result = await orchestrator.synthesizeWithAdjustment('test text', 10);

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledWith('test text', { voiceId: undefined });
        expect(mockFallbackTTS.synthesize).toHaveBeenCalledWith('test text', { voiceId: undefined });
        expect(result.voiceoverUrl).toBe('fallback_url');
    });

    test('Should handle speed adjustment failures gracefully', async () => {
        // Arrange: Primary succeeds on first pass, fails on speed adjustment
        mockPrimaryTTS.synthesize
            .mockResolvedValueOnce({ audioUrl: 'primary_normal', durationSeconds: 20 }) // 1st call (too long)
            .mockRejectedValueOnce(new Error('Speed adjust failed')); // 2nd call (speed)

        // Fallback succeeds on speed adjustment
        mockFallbackTTS.synthesize.mockResolvedValue({
            audioUrl: 'fallback_sped_up',
            durationSeconds: 10
        });

        // Act
        const result = await orchestrator.synthesizeWithAdjustment('test text', 10); // Target 10s, actual 20s -> adjustment needed

        // Assert
        expect(mockPrimaryTTS.synthesize).toHaveBeenCalledTimes(2); // Normal + Speed
        expect(mockFallbackTTS.synthesize).toHaveBeenCalledTimes(1); // Speed fallback
        expect(result.voiceoverUrl).toBe('fallback_sped_up');
    });
});
