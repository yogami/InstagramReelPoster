import { MusicSelector } from '../../../src/application/MusicSelector';
import { InMemoryMusicCatalogClient } from '../../../src/infrastructure/music/InMemoryMusicCatalogClient';
import { Track } from '../../../src/domain/entities/Track';
import fs from 'fs';
import path from 'path';

describe('MusicSelector Fallback Logic', () => {
    let internalCatalog: InMemoryMusicCatalogClient;
    const catalogPath = path.resolve(__dirname, 'test_catalog.json');

    beforeAll(() => {
        const tracks = [
            {
                id: 'short-track',
                title: 'Short Track',
                url: 'http://example.com/short.mp3',
                durationSeconds: 10,
                tags: ['calm']
            }
        ];
        fs.writeFileSync(catalogPath, JSON.stringify(tracks));
        internalCatalog = new InMemoryMusicCatalogClient(catalogPath);
    });

    afterAll(() => {
        if (fs.existsSync(catalogPath)) fs.unlinkSync(catalogPath);
    });

    it('should fall back to any track if duration matches fail and AI is not available', async () => {
        const selector = new MusicSelector(internalCatalog);

        // This query will have minDuration: 42s (60 * 0.7)
        // Our only track is 10s. It should still pick it as a last resort.
        const result = await selector.selectMusic(['meditation'], 60, 'Ambient meditation music');

        expect(result.track.id).toBe('short-track');
        expect(result.source).toBe('internal');
    });

    it('should fall back to any track if tags match fail and duration match fail', async () => {
        const selector = new MusicSelector(internalCatalog);

        const result = await selector.selectMusic(['heavy-metal'], 60, 'Metal music');

        expect(result.track.id).toBe('short-track');
        expect(result.source).toBe('internal');
    });
});
