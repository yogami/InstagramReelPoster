/**
 * Cache Port Interface
 * 
 * Defines the contract for caching services.
 * Implementations: Redis, In-Memory, etc.
 */

export interface ICachePort {
    /**
     * Get a value from the cache.
     * @returns The cached value or null if not found/expired
     */
    get<T>(key: string): Promise<T | null>;

    /**
     * Set a value in the cache.
     * @param key - Cache key
     * @param value - Value to cache
     * @param ttlSeconds - Optional TTL in seconds (default: no expiry)
     */
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;

    /**
     * Delete a value from the cache.
     */
    delete(key: string): Promise<void>;

    /**
     * Check if a key exists in the cache.
     */
    has(key: string): Promise<boolean>;

    /**
     * Clear all cached values (use with caution).
     */
    clear(): Promise<void>;

    /**
     * Get multiple values at once.
     */
    getMany<T>(keys: string[]): Promise<Map<string, T | null>>;

    /**
     * Set multiple values at once.
     */
    setMany<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void>;
}

/**
 * Cache key prefixes for different data types.
 */
export const CACHE_PREFIXES = {
    SCRAPED_WEBSITE: 'scrape:',
    GENERATED_SCRIPT: 'script:',
    TRANSLATED_TEXT: 'translate:',
    TEMPLATE: 'template:'
} as const;

/**
 * Default TTL values in seconds.
 */
export const DEFAULT_TTL = {
    SCRAPED_WEBSITE: 3600,      // 1 hour
    GENERATED_SCRIPT: 86400,    // 24 hours
    TRANSLATED_TEXT: 604800,    // 7 days
    TEMPLATE: 0                 // No expiry
} as const;
