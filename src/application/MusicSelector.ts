import { Track } from '../domain/entities/Track';
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
 * 2. Internal JSON catalog (multi-pass relaxation)
 * 3. AI music generation (Kie.ai/Suno)
 * 4. Hardcoded backup safety track
 */
export class MusicSelector {
    private readonly internalCatalog: IMusicCatalogClient;
    private readonly externalCatalog: IMusicCatalogClient | null;
    private readonly musicGenerator: IMusicGeneratorClient | null;
    private readonly BACKUP_TRACK_URL = 'https://res.cloudinary.com/djol0rpn5/video/upload/v1766043442/voice_sample_lvewfq.ogg'; // Calm background fallback

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
    ): Promise<MusicSelectionResult | null> {
        const query: MusicSearchQuery = {
            tags,
            minDurationSeconds: targetDurationSeconds * 0.7,
            maxDurationSeconds: targetDurationSeconds * 1.5,
            limit: 10,
        };

        // 1. Try external catalog first (if configured)
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

        // 2. Try internal catalog (Multi-pass relaxation)
        try {
            // Pass A: Best match (tags + duration)
            let track = await this.findBestTrack(this.internalCatalog, query, targetDurationSeconds);

            // Pass B: Tags match, any duration
            if (!track && query.tags && query.tags.length > 0) {
                console.log('No tracks matched both tags and duration, trying tags-only match');
                const tagsOnlyQuery: MusicSearchQuery = { ...query, minDurationSeconds: undefined, maxDurationSeconds: undefined };
                track = await this.findBestTrack(this.internalCatalog, tagsOnlyQuery, targetDurationSeconds);
            }

            // Pass C: Duration match only
            if (!track && query.tags && query.tags.length > 0) {
                console.log('No tracks matched with tags, trying duration-only match in internal catalog');
                const durationOnlyQuery: MusicSearchQuery = { ...query, tags: [] };
                track = await this.findBestTrack(this.internalCatalog, durationOnlyQuery, targetDurationSeconds);
            }

            // Pass D: Pick ANY track from catalog regardless of anything
            if (!track) {
                console.log('Relaxing all constraints, picking any track from internal catalog');
                const anyTrackQuery: MusicSearchQuery = { limit: 1, tags: [] };
                const tracks = await this.internalCatalog.searchTracks(anyTrackQuery);
                if (tracks.length > 0) {
                    track = tracks[0];
                }
            }

            if (track) {
                return { track, source: 'internal' };
            }
        } catch (error) {
            console.warn('Internal catalog fallback chain failed:', error);
        }

        // 3. Fall back to AI generation
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

                // Catalog Safety Net (Absolute last resort before hardcoded)
                try {
                    const allTracks = await this.internalCatalog.searchTracks({ limit: 1, tags: [] });
                    if (allTracks.length > 0) {
                        console.log('Using last resort track from catalog after AI failure');
                        return { track: allTracks[0], source: 'internal' };
                    }
                } catch (e) {
                    // Ignore
                }
            }
        }

        // 4. No music available - return null (music is optional)
        console.warn('No background music available. Video will be rendered without music.');
        return null;
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

        // Sort by score descending
        scoredTracks.sort((a, b) => b.score - a.score);

        // VARIETY INJECTION:
        // Instead of always picking index 0, pick randomly from the top 3 (or fewer if not enough)
        // This ensures identical inputs don't always get identical music
        const topCandidates = scoredTracks.slice(0, 3);
        const randomCandidate = topCandidates[Math.floor(Math.random() * topCandidates.length)];

        return randomCandidate.track;
    }

    /**
     * Calculates how well a track matches the requested tags.
     */
    private calculateTagScore(track: Track, requestedTags: string[]): number {
        if (!requestedTags || requestedTags.length === 0) {
            return 1;
        }
        const normalizedRequested = requestedTags.map((t) => t.toLowerCase());
        const matchCount = track.tags.filter((t) => normalizedRequested.includes(t.toLowerCase())).length;
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
