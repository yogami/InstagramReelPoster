import {
    truncateToFitDuration,
    estimateSpeakingDuration,
} from '../../../src/domain/services/DurationCalculator';

describe('DurationCalculator - Truncation', () => {
    const SPEAKING_RATE = 2.5; // words per second (typical TTS rate)

    describe('truncateToFitDuration', () => {
        it('should truncate text that exceeds target duration', () => {
            // 30 words at 2.5 wps = 12 seconds
            const longText = 'This is a test sentence. '.repeat(6).trim(); // ~30 words
            const targetSeconds = 8; // Only ~20 words should fit

            const result = truncateToFitDuration(longText, targetSeconds, SPEAKING_RATE);

            const { estimatedSeconds } = estimateSpeakingDuration(result, SPEAKING_RATE);
            expect(estimatedSeconds).toBeLessThanOrEqual(targetSeconds);
            expect(result.length).toBeLessThan(longText.length);
        });

        it('should not modify text that already fits within duration', () => {
            const shortText = 'This is a short test.'; // ~5 words = 2 seconds
            const targetSeconds = 10;

            const result = truncateToFitDuration(shortText, targetSeconds, SPEAKING_RATE);

            expect(result).toBe(shortText);
        });

        it('should truncate at sentence boundaries when possible', () => {
            const text = 'First sentence here. Second sentence here. Third sentence here.';
            const targetSeconds = 3.5; // ~8-9 words max

            const result = truncateToFitDuration(text, targetSeconds, SPEAKING_RATE);

            // Should end with a period (sentence boundary)
            expect(result.endsWith('.')).toBe(true);
            // Should not include partial sentences
            expect(result).not.toContain('Third');
        });

        it('should handle empty text', () => {
            const result = truncateToFitDuration('', 10, SPEAKING_RATE);
            expect(result).toBe('');
        });

        it('should handle very short target duration', () => {
            const text = 'This is a test sentence with many words.';
            const targetSeconds = 0.5; // Only ~1 word fits

            const result = truncateToFitDuration(text, targetSeconds, SPEAKING_RATE);

            const { estimatedSeconds } = estimateSpeakingDuration(result, SPEAKING_RATE);
            expect(estimatedSeconds).toBeLessThanOrEqual(targetSeconds);
        });
    });
});
