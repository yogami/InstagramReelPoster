/**
 * In-Memory Cache Adapter
 * 
 * Simple in-memory cache for development and testing.
 * Supports TTL with automatic expiration.
 */

import { ICachePort } from '../ports/ICachePort';

interface CacheEntry<T> {
    value: T;
    expiresAt: number | null; // null = no expiry
}

export class InMemoryCacheAdapter implements ICachePort {
    private cache: Map<string, CacheEntry<any>> = new Map();

    async get<T>(key: string): Promise<T | null> {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        // Check expiration
        if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return entry.value as T;
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        const expiresAt = ttlSeconds ? Date.now() + (ttlSeconds * 1000) : null;
        this.cache.set(key, { value, expiresAt });
    }

    async delete(key: string): Promise<void> {
        this.cache.delete(key);
    }

    async has(key: string): Promise<boolean> {
        const value = await this.get(key);
        return value !== null;
    }

    async clear(): Promise<void> {
        this.cache.clear();
    }

    async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
        const results = new Map<string, T | null>();
        for (const key of keys) {
            results.set(key, await this.get<T>(key));
        }
        return results;
    }

    async setMany<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void> {
        for (const entry of entries) {
            await this.set(entry.key, entry.value, entry.ttlSeconds);
        }
    }

    /**
     * Get the current size of the cache (for monitoring).
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Cleanup expired entries (call periodically in long-running processes).
     */
    cleanup(): number {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt !== null && now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}
