import {
    createTrack,
    trackMatchesTags,
    trackFitsDuration,
    Track,
} from '../../../src/domain/entities/Track';

describe('Track', () => {
    describe('createTrack', () => {
        it('should create a valid track with required properties', () => {
            const track = createTrack({
                id: 'track-1',
                tags: ['indian', 'flute', 'meditation'],
                durationSeconds: 180,
                audioUrl: 'https://example.com/track.mp3',
            });

            expect(track.id).toBe('track-1');
            expect(track.tags).toEqual(['indian', 'flute', 'meditation']);
            expect(track.durationSeconds).toBe(180);
            expect(track.audioUrl).toBe('https://example.com/track.mp3');
            expect(track.isAIGenerated).toBe(false);
            expect(track.title).toBeUndefined();
        });

        it('should create a track with optional properties', () => {
            const track = createTrack({
                id: 'track-2',
                title: 'Peaceful Morning',
                tags: ['ambient'],
                durationSeconds: 120,
                audioUrl: 'https://example.com/track2.mp3',
                isAIGenerated: true,
            });

            expect(track.title).toBe('Peaceful Morning');
            expect(track.isAIGenerated).toBe(true);
        });

        it('should normalize tags to lowercase', () => {
            const track = createTrack({
                id: 'track-1',
                tags: ['INDIAN', 'Flute', 'MeDiTaTiOn'],
                durationSeconds: 180,
                audioUrl: 'https://example.com/track.mp3',
            });

            expect(track.tags).toEqual(['indian', 'flute', 'meditation']);
        });

        it('should trim whitespace from fields', () => {
            const track = createTrack({
                id: '  track-1  ',
                title: '  Title  ',
                tags: ['  indian  ', '  flute  '],
                durationSeconds: 180,
                audioUrl: '  https://example.com/track.mp3  ',
            });

            expect(track.id).toBe('track-1');
            expect(track.title).toBe('Title');
            expect(track.tags).toEqual(['indian', 'flute']);
            expect(track.audioUrl).toBe('https://example.com/track.mp3');
        });

        it('should throw error for empty id', () => {
            expect(() =>
                createTrack({
                    id: '',
                    tags: ['test'],
                    durationSeconds: 60,
                    audioUrl: 'https://example.com/track.mp3',
                })
            ).toThrow('Track id cannot be empty');
        });

        it('should throw error for non-positive duration', () => {
            expect(() =>
                createTrack({
                    id: 'track-1',
                    tags: ['test'],
                    durationSeconds: 0,
                    audioUrl: 'https://example.com/track.mp3',
                })
            ).toThrow('Track durationSeconds must be positive');

            expect(() =>
                createTrack({
                    id: 'track-1',
                    tags: ['test'],
                    durationSeconds: -10,
                    audioUrl: 'https://example.com/track.mp3',
                })
            ).toThrow('Track durationSeconds must be positive');
        });

        it('should throw error for empty audioUrl', () => {
            expect(() =>
                createTrack({
                    id: 'track-1',
                    tags: ['test'],
                    durationSeconds: 60,
                    audioUrl: '   ',
                })
            ).toThrow('Track audioUrl cannot be empty');
        });
    });

    describe('trackMatchesTags', () => {
        const track: Track = {
            id: 'track-1',
            tags: ['indian', 'flute', 'meditation', 'ambient'],
            durationSeconds: 180,
            audioUrl: 'https://example.com/track.mp3',
        };

        it('should return true when at least one tag matches', () => {
            expect(trackMatchesTags(track, ['indian'])).toBe(true);
            expect(trackMatchesTags(track, ['flute', 'drums'])).toBe(true);
            expect(trackMatchesTags(track, ['something', 'meditation'])).toBe(true);
        });

        it('should return false when no tags match', () => {
            expect(trackMatchesTags(track, ['drums', 'rock'])).toBe(false);
            expect(trackMatchesTags(track, ['electronic'])).toBe(false);
        });

        it('should handle case-insensitive matching', () => {
            expect(trackMatchesTags(track, ['INDIAN'])).toBe(true);
            expect(trackMatchesTags(track, ['Flute'])).toBe(true);
        });

        it('should return false for empty required tags', () => {
            expect(trackMatchesTags(track, [])).toBe(false);
        });
    });

    describe('trackFitsDuration', () => {
        const track: Track = {
            id: 'track-1',
            tags: ['ambient'],
            durationSeconds: 60,
            audioUrl: 'https://example.com/track.mp3',
        };

        it('should return true when track duration is within tolerance', () => {
            // 60s track, target 60s, tolerance 30%: acceptable range = 42-78s
            expect(trackFitsDuration(track, 60)).toBe(true);
            expect(trackFitsDuration(track, 50)).toBe(true); // 35-65 range
            expect(trackFitsDuration(track, 70)).toBe(true); // 49-91 range
        });

        it('should return false when track duration is outside tolerance', () => {
            // Target 30s with 30% tolerance = 21-39s, track is 60s
            expect(trackFitsDuration(track, 30)).toBe(false);
            // Target 100s with 30% tolerance = 70-130s, track is 60s
            expect(trackFitsDuration(track, 100)).toBe(false);
        });

        it('should use custom tolerance', () => {
            // 60s track, target 80s, tolerance 50%: acceptable range = 40-120s
            expect(trackFitsDuration(track, 80, 0.5)).toBe(true);
            // 60s track, target 80s, tolerance 10%: acceptable range = 72-88s
            expect(trackFitsDuration(track, 80, 0.1)).toBe(false);
        });
    });
});
