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
 * 3. AI music generation (VideoGen/Suno)
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
     * Decomposed into helper methods for complexity ≤3.
     */
    async selectMusic(
        tags: string[],
        targetDurationSeconds: number,
        musicPrompt: string
    ): Promise<MusicSelectionResult | null> {
        const query = this.buildQuery(tags, targetDurationSeconds);

        const result = await this.tryExternalCatalog(query, targetDurationSeconds)
            ?? await this.tryInternalCatalog(query, targetDurationSeconds)
            ?? await this.tryAIGeneration(musicPrompt, targetDurationSeconds);

        if (!result) {
            console.warn('No background music available. Video will be rendered without music.');
        }
        return result;
    }

    private buildQuery(tags: string[], targetDurationSeconds: number): MusicSearchQuery {
        return {
            tags,
            minDurationSeconds: targetDurationSeconds * 0.7,
            maxDurationSeconds: targetDurationSeconds * 1.5,
            limit: 10,
        };
    }

    private async tryExternalCatalog(
        query: MusicSearchQuery,
        targetDuration: number
    ): Promise<MusicSelectionResult | null> {
        if (!this.externalCatalog) return null;

        try {
            const track = await this.findBestTrack(this.externalCatalog, query, targetDuration);
            return track ? { track, source: 'catalog' } : null;
        } catch (error) {
            console.warn('External catalog search failed:', error);
            return null;
        }
    }

    private async tryInternalCatalog(
        query: MusicSearchQuery,
        targetDuration: number
    ): Promise<MusicSelectionResult | null> {
        try {
            const track = await this.findInternalTrackWithRelaxation(query, targetDuration);
            return track ? { track, source: 'internal' } : null;
        } catch (error) {
            console.warn('Internal catalog fallback chain failed:', error);
            return null;
        }
    }

    private async findInternalTrackWithRelaxation(
        query: MusicSearchQuery,
        targetDuration: number
    ): Promise<Track | null> {
        // Pass A: Best match (tags + duration)
        let track = await this.findBestTrack(this.internalCatalog, query, targetDuration);
        if (track) return track;

        // Pass B: Tags match, any duration
        if (query.tags?.length) {
            console.log('No tracks matched both tags and duration, trying tags-only match');
            track = await this.findBestTrack(
                this.internalCatalog,
                { ...query, minDurationSeconds: undefined, maxDurationSeconds: undefined },
                targetDuration
            );
            if (track) return track;
        }

        // Pass C: Duration match only
        if (query.tags?.length) {
            console.log('No tracks matched with tags, trying duration-only match');
            track = await this.findBestTrack(
                this.internalCatalog,
                { ...query, tags: [] },
                targetDuration
            );
            if (track) return track;
        }

        // Pass D: Any track
        console.log('Relaxing all constraints, picking any track from internal catalog');
        const tracks = await this.internalCatalog.searchTracks({ limit: 1, tags: [] });
        return tracks[0] ?? null;
    }

    private async tryAIGeneration(
        musicPrompt: string,
        targetDuration: number
    ): Promise<MusicSelectionResult | null> {
        if (!this.musicGenerator) return null;

        try {
            const request: MusicGenerationRequest = {
                descriptionPrompt: musicPrompt,
                durationSeconds: targetDuration,
                instrumental: true,
            };
            const track = await this.musicGenerator.generateMusic(request);
            return { track, source: 'ai' };
        } catch (error) {
            console.error('AI music generation failed:', error);
            return this.tryLastResortCatalog();
        }
    }

    private async tryLastResortCatalog(): Promise<MusicSelectionResult | null> {
        try {
            const tracks = await this.internalCatalog.searchTracks({ limit: 1, tags: [] });
            if (tracks.length > 0) {
                console.log('Using last resort track from catalog after AI failure');
                return { track: tracks[0], source: 'internal' };
            }
        } catch {
            // Ignore
        }
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
