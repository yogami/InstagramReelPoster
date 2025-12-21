/**
 * Unit Tests: Core Logic (No External Calls)
 * Tests segment count math, MusicSelector logic, and ReelManifest construction
 */

import { MusicSelector, MusicSelectionResult } from '../../src/application/MusicSelector';
import { IMusicCatalogClient, MusicSearchQuery } from '../../src/domain/ports/IMusicCatalogClient';
import { IMusicGeneratorClient, MusicGenerationRequest } from '../../src/domain/ports/IMusicGeneratorClient';
import { Track } from '../../src/domain/entities/Track';
import { createReelManifest } from '../../src/domain/entities/ReelManifest';
import { Segment } from '../../src/domain/entities/Segment';

// ============================================================================
// SEGMENT COUNT CALCULATION TESTS
// ============================================================================
describe('Segment Count Calculation', () => {
    const calculateSegmentCount = (minDuration: number, maxDuration: number): number => {
        const avgDuration = (minDuration + maxDuration) / 2;
        const OPTIMAL_SEGMENT_DURATION = 5;
        return Math.max(2, Math.min(6, Math.round(avgDuration / OPTIMAL_SEGMENT_DURATION)));
    };

    describe('Mathematical formula', () => {
        it('should calculate 3 segments for 10-15s duration', () => {
            expect(calculateSegmentCount(10, 15)).toBe(3);
        });

        it('should calculate 2 segments for 5-10s duration', () => {
            expect(calculateSegmentCount(5, 10)).toBe(2);
        });

        it('should calculate 6 segments for 25-35s duration', () => {
            expect(calculateSegmentCount(25, 35)).toBe(6);
        });

        it('should clamp to minimum 2 segments for very short videos', () => {
            expect(calculateSegmentCount(2, 4)).toBe(2);
        });

        it('should clamp to maximum 6 segments for very long videos', () => {
            expect(calculateSegmentCount(50, 90)).toBe(6);
        });
    });

    describe('Deterministic behavior', () => {
        it('should return same count for same input across multiple calls', () => {
            const results = Array(10).fill(null).map(() => calculateSegmentCount(10, 15));
            expect(new Set(results).size).toBe(1);
            expect(results[0]).toBe(3);
        });
    });
});

// ============================================================================
// MUSIC SELECTOR TESTS
// ============================================================================
describe('MusicSelector', () => {
    // Mock track matching actual Track interface
    const mockTrack: Track = {
        id: 'track-1',
        title: 'Test Track',
        audioUrl: 'https://example.com/track.mp3',
        durationSeconds: 30,
        tags: ['ambient', 'meditation', 'calm'],
    };

    // Mock catalog that returns tracks
    const createMockCatalog = (tracks: Track[] = []): IMusicCatalogClient => ({
        searchTracks: jest.fn().mockResolvedValue(tracks),
        getTrack: jest.fn().mockResolvedValue(tracks[0] || null),
    });

    // Mock catalog that fails
    const createFailingCatalog = (): IMusicCatalogClient => ({
        searchTracks: jest.fn().mockRejectedValue(new Error('Catalog error')),
        getTrack: jest.fn().mockRejectedValue(new Error('Catalog error')),
    });

    // Mock music generator
    const createMockGenerator = (track: Track): IMusicGeneratorClient => ({
        generateMusic: jest.fn().mockResolvedValue(track),
    });

    // Mock failing generator
    const createFailingGenerator = (): IMusicGeneratorClient => ({
        generateMusic: jest.fn().mockRejectedValue(new Error('Generator error')),
    });

    describe('Catalog matching', () => {
        it('should return track from internal catalog when found', async () => {
            const catalog = createMockCatalog([mockTrack]);
            const selector = new MusicSelector(catalog, null, null);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');

            expect(result).not.toBeNull();
            expect(result!.source).toBe('internal');
            expect(result!.track).toEqual(mockTrack);
        });

        it('should prefer external catalog over internal when both have matches', async () => {
            const externalTrack: Track = { ...mockTrack, id: 'external-1', title: 'External Track' };
            const externalCatalog = createMockCatalog([externalTrack]);
            const internalCatalog = createMockCatalog([mockTrack]);
            const selector = new MusicSelector(internalCatalog, externalCatalog, null);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');

            expect(result).not.toBeNull();
            expect(result!.source).toBe('catalog');
            expect(result!.track.id).toBe('external-1');
        });
    });

    describe('Fallback chain', () => {
        it('should fall back to internal when external fails', async () => {
            const failingExternal = createFailingCatalog();
            const internalCatalog = createMockCatalog([mockTrack]);
            const selector = new MusicSelector(internalCatalog, failingExternal, null);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');

            expect(result).not.toBeNull();
            expect(result!.source).toBe('internal');
        });

        it('should fall back to AI generator when both catalogs have no matches', async () => {
            const emptyCatalog = createMockCatalog([]);
            const aiTrack: Track = { ...mockTrack, id: 'ai-generated', isAIGenerated: true };
            const generator = createMockGenerator(aiTrack);
            const selector = new MusicSelector(emptyCatalog, null, generator);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');

            expect(result).not.toBeNull();
            expect(result!.source).toBe('ai');
            expect(result!.track.id).toBe('ai-generated');
        });

        it('should return null when all sources fail or empty and no generator (music is optional)', async () => {
            const emptyCatalog = createMockCatalog([]);
            const selector = new MusicSelector(emptyCatalog, null, null);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');
            // Music is optional, so null is returned when unavailable
            expect(result).toBeNull();
        });

        it('should return null when all sources including generator fail (music is optional)', async () => {
            const emptyCatalog = createMockCatalog([]);
            const failingGenerator = createFailingGenerator();
            const selector = new MusicSelector(emptyCatalog, null, failingGenerator);

            const result = await selector.selectMusic(['ambient'], 30, 'calm music');
            // Music is optional, so null is returned when all sources fail
            expect(result).toBeNull();
        });
    });
});

// ============================================================================
// REEL MANIFEST TESTS
// ============================================================================
describe('ReelManifest', () => {
    const createTestSegment = (index: number, start: number, end: number): Segment => ({
        index,
        startSeconds: start,
        endSeconds: end,
        commentary: `Commentary ${index}`,
        imagePrompt: `Image prompt ${index}`,
        imageUrl: `https://example.com/image${index}.jpg`,
        caption: `Caption ${index}`,
    });

    describe('Construction validation', () => {
        it('should create manifest with valid inputs', () => {
            const segments = [
                createTestSegment(0, 0, 5),
                createTestSegment(1, 5, 10),
                createTestSegment(2, 10, 15),
            ];

            const manifest = createReelManifest({
                durationSeconds: 15,
                segments,
                voiceoverUrl: 'https://example.com/voiceover.mp3',
                musicUrl: 'https://example.com/music.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/subtitles.srt',
            });

            expect(manifest.durationSeconds).toBe(15);
            expect(manifest.segments).toHaveLength(3);
            expect(manifest.voiceoverUrl).toBe('https://example.com/voiceover.mp3');
        });

        it('should throw on zero duration', () => {
            const segments = [createTestSegment(0, 0, 5)];

            expect(() => createReelManifest({
                durationSeconds: 0,
                segments,
                voiceoverUrl: 'https://example.com/v.mp3',
                musicUrl: 'https://example.com/m.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/s.srt',
            })).toThrow('durationSeconds must be positive');
        });

        it('should throw on empty segments', () => {
            expect(() => createReelManifest({
                durationSeconds: 15,
                segments: [],
                voiceoverUrl: 'https://example.com/v.mp3',
                musicUrl: 'https://example.com/m.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/s.srt',
            })).toThrow('Manifest must have either segments or animatedVideoUrl(s)');
        });

        it('should throw on empty voiceover URL', () => {
            const segments = [createTestSegment(0, 0, 5)];

            expect(() => createReelManifest({
                durationSeconds: 15,
                segments,
                voiceoverUrl: '',
                musicUrl: 'https://example.com/m.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/s.srt',
            })).toThrow('voiceoverUrl cannot be empty');
        });

        it('should throw if any segment missing imageUrl', () => {
            const segments = [
                createTestSegment(0, 0, 5),
                { ...createTestSegment(1, 5, 10), imageUrl: undefined as any },
            ];

            expect(() => createReelManifest({
                durationSeconds: 15,
                segments,
                voiceoverUrl: 'https://example.com/v.mp3',
                musicUrl: 'https://example.com/m.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/s.srt',
            })).toThrow('missing imageUrl');
        });
    });

    describe('Timing calculations', () => {
        it('should preserve segment start and end times', () => {
            const segments = [
                createTestSegment(0, 0, 4.5),
                createTestSegment(1, 4.5, 9),
                createTestSegment(2, 9, 12),
            ];

            const manifest = createReelManifest({
                durationSeconds: 12,
                segments,
                voiceoverUrl: 'https://example.com/v.mp3',
                musicUrl: 'https://example.com/m.mp3',
                musicDurationSeconds: 30,
                subtitlesUrl: 'https://example.com/s.srt',
            });

            expect(manifest.segments![0].start).toBe(0);
            expect(manifest.segments![0].end).toBe(4.5);
            expect(manifest.segments![1].start).toBe(4.5);
            expect(manifest.segments![1].end).toBe(9);
            expect(manifest.segments![2].start).toBe(9);
            expect(manifest.segments![2].end).toBe(12);
        });

        it('should trim whitespace from URLs', () => {
            const segments = [createTestSegment(0, 0, 5)];

            const manifest = createReelManifest({
                durationSeconds: 5,
                segments,
                voiceoverUrl: '  https://example.com/v.mp3  ',
                musicUrl: '  https://example.com/m.mp3  ',
                musicDurationSeconds: 30,
                subtitlesUrl: '  https://example.com/s.srt  ',
            });

            expect(manifest.voiceoverUrl).toBe('https://example.com/v.mp3');
            expect(manifest.musicUrl).toBe('https://example.com/m.mp3');
            expect(manifest.subtitlesUrl).toBe('https://example.com/s.srt');
        });
    });
});
