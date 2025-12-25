import { estimateSpeakingDuration, needsTextAdjustment } from '../../../src/domain/services/DurationCalculator';
import { getConfig } from '../../../src/config';

describe('Commentary Precision Requirements', () => {
    const config = getConfig();

    it('should stay within 95-100% video length (100% case)', () => {
        const targetSeconds = 60;
        const speakingRate = config.speakingRateWps;
        const text = 'word '.repeat(Math.floor(targetSeconds * speakingRate));
        const estimate = estimateSpeakingDuration(text);

        expect(needsTextAdjustment(estimate.estimatedSeconds, targetSeconds)).toBe('ok');
    });

    it('should flag "shorter" if even 1% over (101% case)', () => {
        const targetSeconds = 60;
        const speakingRate = config.speakingRateWps;
        // 101% of target
        const wordCount = Math.floor(targetSeconds * 1.01 * speakingRate);
        const text = 'word '.repeat(wordCount);
        const estimate = estimateSpeakingDuration(text);

        expect(needsTextAdjustment(estimate.estimatedSeconds, targetSeconds)).toBe('shorter');
    });

    it('should stay "ok" at 96% video length', () => {
        const targetSeconds = 60;
        const speakingRate = config.speakingRateWps;
        // 96% of target
        const wordCount = Math.floor(targetSeconds * 0.96 * speakingRate);
        const text = 'word '.repeat(wordCount);
        const estimate = estimateSpeakingDuration(text);

        expect(needsTextAdjustment(estimate.estimatedSeconds, targetSeconds)).toBe('ok');
    });

    it('should flag "longer" if below 95% (94% case)', () => {
        const targetSeconds = 60;
        const speakingRate = config.speakingRateWps;
        // 94% of target
        const wordCount = Math.floor(targetSeconds * 0.94 * speakingRate);
        const text = 'word '.repeat(wordCount);
        const estimate = estimateSpeakingDuration(text);

        expect(needsTextAdjustment(estimate.estimatedSeconds, targetSeconds)).toBe('longer');
    });
});
