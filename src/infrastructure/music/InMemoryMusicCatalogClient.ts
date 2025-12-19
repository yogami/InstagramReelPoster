import fs from 'fs';
import path from 'path';
import {
    IMusicCatalogClient,
    MusicSearchQuery,
} from '../../domain/ports/IMusicCatalogClient';
import { Track, createTrack, trackMatchesTags, trackFitsDuration } from '../../domain/entities/Track';

/**
 * Raw track data from the JSON catalog file.
 */
interface RawTrackData {
    id: string;
    audioUrl: string;
    title?: string;
    tags: string[];
    durationSeconds: number;
}

/**
 * In-memory music catalog client that loads tracks from a JSON file.
 */
export class InMemoryMusicCatalogClient implements IMusicCatalogClient {
    private tracks: Track[] = [];
    private loaded: boolean = false;
    private readonly catalogPath: string;

    constructor(catalogPath: string) {
        this.catalogPath = catalogPath;
    }

    /**
     * Loads the catalog from the JSON file if not already loaded.
     */
    private async ensureLoaded(): Promise<void> {
        if (this.loaded) {
            return;
        }

        try {
            const possiblePaths = [
                path.isAbsolute(this.catalogPath) ? this.catalogPath : path.resolve(process.cwd(), this.catalogPath),
                path.resolve(process.cwd(), 'assets/music_catalog.json'),
                path.join(__dirname, '../../../../assets/music_catalog.json'),
                '/app/assets/music_catalog.json',
                '/app/data/music_catalog.json',
                '/app/data/internal_music_catalog.json'
            ];

            let absolutePath = '';
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    absolutePath = p;
                    break;
                }
            }

            if (!absolutePath) {
                console.warn(`Music catalog file not found in any expected location. Searched: ${possiblePaths.join(', ')}`);
                this.tracks = [];
                this.loaded = true;
                return;
            }

            console.log(`Loading music catalog from: ${absolutePath}`);
            const data = fs.readFileSync(absolutePath, 'utf-8');
            const rawTracks: RawTrackData[] = JSON.parse(data);

            this.tracks = rawTracks.map((raw) =>
                createTrack({
                    id: raw.id,
                    title: raw.title,
                    tags: raw.tags,
                    durationSeconds: raw.durationSeconds,
                    audioUrl: raw.audioUrl,
                    isAIGenerated: false,
                })
            );

            this.loaded = true;
        } catch (error) {
            console.error(`Failed to load music catalog: ${error}`);
            this.tracks = [];
            this.loaded = true;
        }
    }

    /**
     * Searches for tracks matching the query.
     */
    async searchTracks(query: MusicSearchQuery): Promise<Track[]> {
        await this.ensureLoaded();

        let results = this.tracks;

        // Filter by tags if provided
        if (query.tags && query.tags.length > 0) {
            results = results.filter((track) => trackMatchesTags(track, query.tags));
        }

        // Filter by duration range
        if (query.minDurationSeconds !== undefined) {
            results = results.filter(
                (track) => track.durationSeconds >= query.minDurationSeconds!
            );
        }
        if (query.maxDurationSeconds !== undefined) {
            results = results.filter(
                (track) => track.durationSeconds <= query.maxDurationSeconds!
            );
        }

        // Sort by how well they match the target duration (if both min and max provided)
        if (query.minDurationSeconds !== undefined && query.maxDurationSeconds !== undefined) {
            const targetDuration = (query.minDurationSeconds + query.maxDurationSeconds) / 2;
            results.sort((a, b) => {
                const diffA = Math.abs(a.durationSeconds - targetDuration);
                const diffB = Math.abs(b.durationSeconds - targetDuration);
                return diffA - diffB;
            });
        }

        // Apply limit
        if (query.limit !== undefined && query.limit > 0) {
            results = results.slice(0, query.limit);
        }

        return results;
    }

    /**
     * Gets a specific track by ID.
     */
    async getTrack(id: string): Promise<Track | null> {
        await this.ensureLoaded();
        return this.tracks.find((track) => track.id === id) || null;
    }

    /**
     * Reloads the catalog from disk.
     */
    async reload(): Promise<void> {
        this.loaded = false;
        await this.ensureLoaded();
    }

    /**
     * Gets the count of loaded tracks.
     */
    async getTrackCount(): Promise<number> {
        await this.ensureLoaded();
        return this.tracks.length;
    }
}
