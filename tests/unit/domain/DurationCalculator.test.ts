import {
    estimateSpeakingDuration,
    calculateTargetWordCount,
    isDurationWithinTolerance,
    calculateSpeedAdjustment,
    needsTextAdjustment,
    distributeSegmentDurations,
    calculateSegmentTimings,
} from '../../../src/domain/services/DurationCalculator';

describe('DurationCalculator', () => {
    describe('estimateSpeakingDuration', () => {
        it('should estimate duration based on word count and speaking rate', () => {
            const text = 'This is a simple test sentence with ten words here';
            const result = estimateSpeakingDuration(text, 2.5);

            expect(result.wordCount).toBe(10);
            expect(result.estimatedSeconds).toBe(4); // 10 words / 2.5 wps
            expect(result.speakingRate).toBe(2.5);
        });

        it('should use config-based speaking rate (default 2.3 wps in tests)', () => {
            const text = 'Word word word word word';
            const result = estimateSpeakingDuration(text);

            expect(result.wordCount).toBe(5);
            // Uses config.speakingRateWps which defaults to 2.3 in test environment
            expect(result.estimatedSeconds).toBeGreaterThan(0);
            expect(result.speakingRate).toBeGreaterThan(0);
        });

        it('should handle empty text', () => {
            const result = estimateSpeakingDuration('');
            expect(result.wordCount).toBe(0);
            expect(result.estimatedSeconds).toBe(0);
        });

        it('should handle text with extra whitespace', () => {
            const text = '  Word   word    word  ';
            const result = estimateSpeakingDuration(text);
            expect(result.wordCount).toBe(3);
        });
    });

    describe('calculateTargetWordCount', () => {
        it('should calculate word count for target duration (targeting 99% safety)', () => {
            // 10 * 0.99 * 2.5 = 24.75 -> floor = 24
            expect(calculateTargetWordCount(10, 2.5)).toBe(24);
            // 30 * 0.99 * 2.0 = 59.4 -> floor = 59
            expect(calculateTargetWordCount(30, 2.0)).toBe(59);
        });

        it('should use floor to ensure no overshoot', () => {
            // 10 * 0.99 * 2.3 = 22.77 -> floor = 22
            expect(calculateTargetWordCount(10, 2.3)).toBe(22);
        });
    });

    describe('isDurationWithinTolerance', () => {
        it('should return true when within default tolerance of 0.5s', () => {
            expect(isDurationWithinTolerance(30, 30)).toBe(true);
            expect(isDurationWithinTolerance(30.5, 30)).toBe(true);
            expect(isDurationWithinTolerance(29.5, 30)).toBe(true);
        });

        it('should return false when outside default tolerance', () => {
            expect(isDurationWithinTolerance(31, 30)).toBe(false);
            expect(isDurationWithinTolerance(29, 30)).toBe(false);
        });

        it('should use custom tolerance', () => {
            expect(isDurationWithinTolerance(32, 30, 3)).toBe(true);
            expect(isDurationWithinTolerance(25, 30, 5)).toBe(true);
        });
    });

    describe('calculateSpeedAdjustment', () => {
        it('should return 1.0 for matching durations', () => {
            expect(calculateSpeedAdjustment(30, 30)).toBe(1.0);
        });

        it('should return speed > 1 when actual is longer than target', () => {
            const speed = calculateSpeedAdjustment(33, 30);
            expect(speed).toBeCloseTo(1.1);
        });

        it('should return speed < 1 when actual is shorter than target', () => {
            const speed = calculateSpeedAdjustment(27, 30);
            expect(speed).toBeCloseTo(0.9);
        });

        it('should clamp to min/max speed bounds', () => {
            expect(calculateSpeedAdjustment(50, 30)).toBe(1.25); // Would be 1.66
            expect(calculateSpeedAdjustment(10, 30)).toBe(0.85); // Would be 0.33
        });

        it('should use custom speed bounds', () => {
            expect(calculateSpeedAdjustment(40, 30, 0.8, 1.2)).toBe(1.2);
            expect(calculateSpeedAdjustment(20, 30, 0.5, 1.5)).toBeCloseTo(0.67);
        });

        it('should return 1.0 for invalid inputs', () => {
            expect(calculateSpeedAdjustment(0, 30)).toBe(1.0);
            expect(calculateSpeedAdjustment(30, 0)).toBe(1.0);
        });
    });

    describe('needsTextAdjustment', () => {
        it('should return "ok" when within [97%, 100%] range (default 3% tolerance)', () => {
            expect(needsTextAdjustment(30, 30)).toBe('ok');
            expect(needsTextAdjustment(28.5, 30)).toBe('ok'); // -5% is boundary
        });

        it('should return "shorter" even for small overshoots', () => {
            expect(needsTextAdjustment(30.1, 30)).toBe('shorter');
        });

        it('should return "longer" when text is below 95%', () => {
            expect(needsTextAdjustment(28, 30)).toBe('longer');
        });

        it('should return "shorter" when text is too long', () => {
            expect(needsTextAdjustment(36, 30)).toBe('shorter'); // +20%
            expect(needsTextAdjustment(40, 30)).toBe('shorter'); // +33%
        });

        it('should return "longer" when text is too short', () => {
            expect(needsTextAdjustment(24, 30)).toBe('longer'); // -20%
            expect(needsTextAdjustment(20, 30)).toBe('longer'); // -33%
        });

        it('should use custom tolerance', () => {
            expect(needsTextAdjustment(33, 30, 0.05)).toBe('shorter'); // +10% with 5% tolerance
            expect(needsTextAdjustment(27, 30, 0.05)).toBe('longer'); // -10% with 5% tolerance
        });
    });

    describe('distributeSegmentDurations', () => {
        it('should distribute duration evenly across segments', () => {
            const durations = distributeSegmentDurations(60, 3);
            expect(durations).toEqual([20, 20, 20]);
        });

        it('should handle non-even division', () => {
            const durations = distributeSegmentDurations(10, 3);
            expect(durations[0]).toBeCloseTo(3.33);
            expect(durations[1]).toBeCloseTo(3.33);
            expect(durations[2]).toBeCloseTo(3.33);
        });

        it('should return empty array for zero segments', () => {
            expect(distributeSegmentDurations(60, 0)).toEqual([]);
        });

        it('should handle single segment', () => {
            expect(distributeSegmentDurations(45, 1)).toEqual([45]);
        });
    });

    describe('calculateSegmentTimings', () => {
        it('should calculate start and end times for segments', () => {
            const timings = calculateSegmentTimings([10, 15, 20]);
            expect(timings).toEqual([
                { start: 0, end: 10 },
                { start: 10, end: 25 },
                { start: 25, end: 45 },
            ]);
        });

        it('should handle empty durations', () => {
            expect(calculateSegmentTimings([])).toEqual([]);
        });

        it('should handle single segment', () => {
            expect(calculateSegmentTimings([30])).toEqual([{ start: 0, end: 30 }]);
        });

        it('should handle decimal durations', () => {
            const timings = calculateSegmentTimings([5.5, 7.3]);
            expect(timings[0]).toEqual({ start: 0, end: 5.5 });
            expect(timings[1]).toEqual({ start: 5.5, end: 12.8 });
        });
    });
});
