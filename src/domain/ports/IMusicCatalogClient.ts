import { Track } from '../entities/Track';

/**
 * MusicSearchQuery for searching the music catalog.
 */
export interface MusicSearchQuery {
    /** Tags to match (e.g., ['indian', 'flute', 'meditation']) */
    tags: string[];
    /** Minimum track duration in seconds */
    minDurationSeconds?: number;
    /** Maximum track duration in seconds */
    maxDurationSeconds?: number;
    /** Maximum number of results to return */
    limit?: number;
}

/**
 * IMusicCatalogClient - Port for music catalog services.
 * Implementations: InMemoryMusicCatalogClient, ExternalMusicCatalogClient
 */
export interface IMusicCatalogClient {
    /**
     * Searches for tracks matching the query.
     * @param query Search parameters
     * @returns Array of matching tracks
     */
    searchTracks(query: MusicSearchQuery): Promise<Track[]>;

    /**
     * Gets a specific track by ID.
     * @param id Track ID
     * @returns Track or null if not found
     */
    getTrack(id: string): Promise<Track | null>;
}
