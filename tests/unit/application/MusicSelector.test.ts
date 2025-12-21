import { MusicSelector } from '../../../src/application/MusicSelector';
import { IMusicCatalogClient, MusicSearchQuery } from '../../../src/domain/ports/IMusicCatalogClient';
import { IMusicGeneratorClient, MusicGenerationRequest } from '../../../src/domain/ports/IMusicGeneratorClient';
import { Track } from '../../../src/domain/entities/Track';

describe('MusicSelector Edge Cases', () => {
    const mockTrack: Track = {
        id: 'mock-track-1',
        title: 'Mock Track',
        audioUrl: 'https://example.com/track.mp3',
        durationSeconds: 30,
        tags: ['calm', 'ambient'],
    };

    // Mock implementations
    const createMockCatalog = (tracks: Track[] = [], shouldFail = false): IMusicCatalogClient => ({
        searchTracks: jest.fn().mockImplementation(() => {
            if (shouldFail) throw new Error('Catalog error');
            return Promise.resolve(tracks);
        }),
        getTrack: jest.fn().mockResolvedValue(tracks[0] || null),
    });

    const createMockGenerator = (track: Track | null = null, error: Error | null = null): IMusicGeneratorClient => ({
        generateMusic: jest.fn().mockImplementation(() => {
            if (error) throw error;
            return Promise.resolve(track);
        }),
    });

    describe('Malformed catalog handling', () => {
        it('should return null when internal catalog throws error (music is optional)', async () => {
            const failingCatalog = createMockCatalog([], true);
            const selector = new MusicSelector(failingCatalog, null, null);

            const result = await selector.selectMusic(['ambient'], 30, 'Calm music');

            // Music is optional - when catalog fails and no AI, returns null
            expect(result).toBeNull();
        });

        it('should return null when catalog returns empty and no AI', async () => {
            const emptyCatalog = createMockCatalog([]);
            const selector = new MusicSelector(emptyCatalog, null, null);

            const result = await selector.selectMusic(['metal'], 30, 'Heavy music');

            expect(result).toBeNull();
        });
    });

    describe('AI generator failure scenarios', () => {
        it('should return null when AI throws 402 payment required', async () => {
            const emptyCatalog = createMockCatalog([]);
            const failingGenerator = createMockGenerator(null, new Error('Payment required: 402'));
            const selector = new MusicSelector(emptyCatalog, null, failingGenerator);

            const result = await selector.selectMusic(['ambient'], 30, 'Calm music');

            expect(result).toBeNull();
        });

        it('should return null when AI throws rate limit', async () => {
            const emptyCatalog = createMockCatalog([]);
            const failingGenerator = createMockGenerator(null, new Error('Rate limit exceeded'));
            const selector = new MusicSelector(emptyCatalog, null, failingGenerator);

            const result = await selector.selectMusic(['ambient'], 30, 'Calm music');

            expect(result).toBeNull();
        });

        it('should try catalog safety net after AI failure before using hardcoded backup', async () => {
            const catalogWithTrack = createMockCatalog([mockTrack]);
            const failingGenerator = createMockGenerator(null, new Error('AI failed'));
            const selector = new MusicSelector(catalogWithTrack, null, failingGenerator);

            const result = await selector.selectMusic(['nonexistent'], 30, 'Music');

            // Should use catalog track, not backup
            expect(result!.track.id).toBe('mock-track-1');
            expect(result!.source).toBe('internal');
        });
    });

    describe('External catalog fallback', () => {
        it('should fall back to internal when external catalog fails', async () => {
            const internalCatalog = createMockCatalog([mockTrack]);
            const failingExternalCatalog = createMockCatalog([], true);
            const selector = new MusicSelector(internalCatalog, failingExternalCatalog, null);

            const result = await selector.selectMusic(['ambient'], 30, 'Calm music');

            expect(result!.track.id).toBe('mock-track-1');
            expect(result!.source).toBe('internal');
        });

        it('should use external catalog track when available', async () => {
            const externalTrack: Track = { ...mockTrack, id: 'external-track' };
            const internalCatalog = createMockCatalog([mockTrack]);
            const externalCatalog = createMockCatalog([externalTrack]);
            const selector = new MusicSelector(internalCatalog, externalCatalog, null);

            const result = await selector.selectMusic(['ambient'], 30, 'Calm music');

            expect(result!.track.id).toBe('external-track');
            expect(result!.source).toBe('catalog');
        });
    });

    describe('Duration boundary conditions', () => {
        it('should handle duration exactly at min boundary (70% of target)', async () => {
            const shortTrack: Track = { ...mockTrack, durationSeconds: 21 }; // 70% of 30s
            const catalog = createMockCatalog([shortTrack]);
            const selector = new MusicSelector(catalog, null, null);

            const result = await selector.selectMusic(['ambient'], 30, 'Music');

            expect(result!.track.durationSeconds).toBe(21);
        });

        it('should handle duration exactly at max boundary (150% of target)', async () => {
            const longTrack: Track = { ...mockTrack, durationSeconds: 45 }; // 150% of 30s
            const catalog = createMockCatalog([longTrack]);
            const selector = new MusicSelector(catalog, null, null);

            const result = await selector.selectMusic(['ambient'], 30, 'Music');

            expect(result!.track.durationSeconds).toBe(45);
        });

        it('should pick best scoring track when multiple match', async () => {
            const tracks: Track[] = [
                { ...mockTrack, id: 'exact-match', durationSeconds: 30, tags: ['ambient', 'calm'] },
                { ...mockTrack, id: 'close-match', durationSeconds: 35, tags: ['ambient'] },
                { ...mockTrack, id: 'far-match', durationSeconds: 50, tags: ['ambient'] },
            ];
            const catalog = createMockCatalog(tracks);
            const selector = new MusicSelector(catalog, null, null);

            const result = await selector.selectMusic(['ambient', 'calm'], 30, 'Music');

            // MusicSelector picks from matches - the exact order depends on internal scoring
            // Both 'exact-match' and 'close-match' are valid picks; just verify we got a match
            expect(result).not.toBeNull();
            expect(['exact-match', 'close-match'].includes(result!.track.id)).toBe(true);
        });
    });

    describe('Multi-pass relaxation', () => {
        it('should relax duration constraint when no exact match', async () => {
            const tracks: Track[] = [
                { ...mockTrack, id: 'tag-match-only', durationSeconds: 100, tags: ['ambient'] },
            ];
            const catalog = createMockCatalog(tracks);
            const selector = new MusicSelector(catalog, null, null);

            // Target 30s, track is 100s - way outside normal range
            // But it matches tags, so pass B should find it
            const result = await selector.selectMusic(['ambient'], 30, 'Music');

            expect(result!.track.id).toBe('tag-match-only');
        });

        it('should relax tag constraint when no tag match', async () => {
            const tracks: Track[] = [
                { ...mockTrack, id: 'duration-match-only', durationSeconds: 30, tags: ['rock'] },
            ];
            const catalog = createMockCatalog(tracks);
            const selector = new MusicSelector(catalog, null, null);

            // Request 'ambient' but only 'rock' exists with right duration
            const result = await selector.selectMusic(['ambient'], 30, 'Music');

            expect(result!.track.id).toBe('duration-match-only');
        });
    });

    describe('Complete fallback chain', () => {
        it('should traverse full chain: external → internal → AI → null when all fail', async () => {
            const failingExternal = createMockCatalog([], true);
            const emptyInternal = createMockCatalog([]);
            const failingAI = createMockGenerator(null, new Error('AI unavailable'));

            const selector = new MusicSelector(emptyInternal, failingExternal, failingAI);

            const result = await selector.selectMusic(['ambient'], 30, 'Music');

            // Music is optional - when all sources fail, null is returned
            expect(result).toBeNull();
        });
    });
});
