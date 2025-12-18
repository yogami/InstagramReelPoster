import { Track, trackMatchesTags, trackFitsDuration } from '../domain/entities/Track';
import { IMusicCatalogClient, MusicSearchQuery } from '../domain/ports/IMusicCatalogClient';
import { IMusicGeneratorClient, MusicGenerationRequest } from '../domain/ports/IMusicGeneratorClient';

export type MusicSource = 'catalog' | 'internal' | 'ai';

export interface MusicSelectionResult {
    track: Track;
    source: MusicSource;
}

/**
 * MusicSelector implements the fallback chain for music selection:
 * 1. External catalog API (if configured)
 * 2. Internal JSON catalog
 * 3. AI music generation (Kie.ai/Suno)
 */
export class MusicSelector {
    private readonly internalCatalog: IMusicCatalogClient;
    private readonly externalCatalog: IMusicCatalogClient | null;
    private readonly musicGenerator: IMusicGeneratorClient | null;

    constructor(
        internalCatalog: IMusicCatalogClient,
        externalCatalog: IMusicCatalogClient | null = null,
        musicGenerator: IMusicGeneratorClient | null = null
    ) {
        this.internalCatalog = internalCatalog;
        this.externalCatalog = externalCatalog;
        this.musicGenerator = musicGenerator;
    }

    /**
     * Selects music using the fallback chain.
     */
    async selectMusic(
        tags: string[],
        targetDurationSeconds: number,
        musicPrompt: string
    ): Promise<MusicSelectionResult> {
        const query: MusicSearchQuery = {
            tags,
            minDurationSeconds: targetDurationSeconds * 0.7,
            maxDurationSeconds: targetDurationSeconds * 1.5,
            limit: 10,
        };

        // Try external catalog first (if configured)
        if (this.externalCatalog) {
            try {
                const track = await this.findBestTrack(this.externalCatalog, query, targetDurationSeconds);
                if (track) {
                    return { track, source: 'catalog' };
                }
            } catch (error) {
                console.warn('External catalog search failed:', error);
            }
        }

        // Try internal catalog
        try {
            let track = await this.findBestTrack(this.internalCatalog, query, targetDurationSeconds);

            // Second pass: if no tracks matched with tags, try matching just by duration
            if (!track && query.tags && query.tags.length > 0) {
                console.log('No tracks matched with tags, trying duration-only match in internal catalog');
                const durationOnlyQuery = { ...query, tags: [] };
                track = await this.findBestTrack(this.internalCatalog, durationOnlyQuery, targetDurationSeconds);
            }

            if (track) {
                return { track, source: 'internal' };
            }
        } catch (error) {
            console.warn('Internal catalog search failed:', error);
        }

        // Fall back to AI generation
        if (this.musicGenerator) {
            try {
                const request: MusicGenerationRequest = {
                    descriptionPrompt: musicPrompt,
                    durationSeconds: targetDurationSeconds,
                    instrumental: true,
                };
                const track = await this.musicGenerator.generateMusic(request);
                return { track, source: 'ai' };
            } catch (error) {
                console.error('AI music generation failed:', error);

                // Final safety net: pick any track from internal catalog
                try {
                    const allTracks = await (this.internalCatalog as any).searchTracks({ limit: 1 });
                    if (allTracks.length > 0) {
                        return { track: allTracks[0], source: 'internal' };
                    }
                } catch (e) {
                    // Ignore, show original error
                }

                throw new Error(`All music sources failed. Last error: ${error}`);
            }
        }

        throw new Error('No music sources available and AI generation not configured');
    }

    /**
     * Finds the best matching track from a catalog.
     */
    private async findBestTrack(
        catalog: IMusicCatalogClient,
        query: MusicSearchQuery,
        targetDuration: number
    ): Promise<Track | null> {
        const tracks = await catalog.searchTracks(query);

        if (tracks.length === 0) {
            return null;
        }

        // Score tracks by tag match count and duration proximity
        const scoredTracks = tracks.map((track) => {
            const tagScore = this.calculateTagScore(track, query.tags);
            const durationScore = this.calculateDurationScore(track, targetDuration);
            const totalScore = tagScore * 0.6 + durationScore * 0.4;
            return { track, score: totalScore };
        });

        // Sort by score descending and return best match
        scoredTracks.sort((a, b) => b.score - a.score);
        return scoredTracks[0].track;
    }

    /**
     * Calculates how well a track matches the requested tags.
     */
    private calculateTagScore(track: Track, requestedTags: string[]): number {
        if (requestedTags.length === 0) {
            return 1;
        }
        const normalizedRequested = requestedTags.map((t) => t.toLowerCase());
        const matchCount = track.tags.filter((t) => normalizedRequested.includes(t)).length;
        return matchCount / requestedTags.length;
    }

    /**
     * Calculates how well a track's duration matches the target.
     */
    private calculateDurationScore(track: Track, targetDuration: number): number {
        const diff = Math.abs(track.durationSeconds - targetDuration);
        const tolerance = targetDuration * 0.3;
        if (diff <= tolerance) {
            return 1 - (diff / tolerance) * 0.5;
        }
        return Math.max(0, 0.5 - (diff - tolerance) / targetDuration);
    }
}
