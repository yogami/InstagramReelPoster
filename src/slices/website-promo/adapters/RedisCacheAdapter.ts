import Redis from 'ioredis';
import { ICachePort } from '../ports/ICachePort';

/**
 * Redis Cache Adapter
 * 
 * Production-ready cache implementation using Redis.
 * Supports TTL, batch operations, and key prefixes.
 */
export class RedisCacheAdapter implements ICachePort {
    private client: Redis;

    constructor(redisUrl: string) {
        this.client = new Redis(redisUrl, {
            retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                return delay;
            },
            maxRetriesPerRequest: 3
        });

        this.client.on('error', (err) => {
            console.error('Redis Cache Adapter Error:', err);
        });
    }

    async get<T>(key: string): Promise<T | null> {
        try {
            const data = await this.client.get(key);
            return data ? JSON.parse(data) : null;
        } catch (error) {
            console.error(`Redis Get Error [${key}]:`, error);
            return null; // Fail-safe: return null on error so pipeline continues
        }
    }

    async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
        try {
            const data = JSON.stringify(value);
            if (ttlSeconds && ttlSeconds > 0) {
                await this.client.set(key, data, 'EX', ttlSeconds);
            } else {
                await this.client.set(key, data);
            }
        } catch (error) {
            console.error(`Redis Set Error [${key}]:`, error);
        }
    }

    async delete(key: string): Promise<void> {
        try {
            await this.client.del(key);
        } catch (error) {
            console.error(`Redis Delete Error [${key}]:`, error);
        }
    }

    async has(key: string): Promise<boolean> {
        try {
            const exists = await this.client.exists(key);
            return exists === 1;
        } catch (error) {
            console.error(`Redis Has Error [${key}]:`, error);
            return false;
        }
    }

    async clear(): Promise<void> {
        try {
            await this.client.flushdb();
        } catch (error) {
            console.error('Redis Clear Error:', error);
        }
    }

    async getMany<T>(keys: string[]): Promise<Map<string, T | null>> {
        const results = new Map<string, T | null>();
        if (keys.length === 0) return results;

        try {
            const values = await this.client.mget(...keys);
            keys.forEach((key, index) => {
                const val = values[index];
                results.set(key, val ? JSON.parse(val) : null);
            });
        } catch (error) {
            console.error('Redis GetMany Error:', error);
            keys.forEach(key => results.set(key, null));
        }
        return results;
    }

    async setMany<T>(entries: Array<{ key: string; value: T; ttlSeconds?: number }>): Promise<void> {
        if (entries.length === 0) return;

        try {
            const pipeline = this.client.pipeline();
            for (const { key, value, ttlSeconds } of entries) {
                const data = JSON.stringify(value);
                if (ttlSeconds && ttlSeconds > 0) {
                    pipeline.set(key, data, 'EX', ttlSeconds);
                } else {
                    pipeline.set(key, data);
                }
            }
            await pipeline.exec();
        } catch (error) {
            console.error('Redis SetMany Error:', error);
        }
    }

    /**
     * Gracefully close the Redis connection.
     */
    async disconnect(): Promise<void> {
        await this.client.quit();
    }
}
