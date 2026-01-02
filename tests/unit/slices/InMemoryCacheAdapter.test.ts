/**
 * Unit Tests for InMemoryCacheAdapter
 */

import { InMemoryCacheAdapter } from '../../../src/slices/website-promo/adapters/InMemoryCacheAdapter';

describe('InMemoryCacheAdapter', () => {
    let cache: InMemoryCacheAdapter;

    beforeEach(() => {
        cache = new InMemoryCacheAdapter();
    });

    describe('get/set', () => {
        it('should store and retrieve values', async () => {
            await cache.set('key1', { data: 'test' });

            const result = await cache.get<{ data: string }>('key1');

            expect(result).toEqual({ data: 'test' });
        });

        it('should return null for non-existent keys', async () => {
            const result = await cache.get('nonexistent');

            expect(result).toBeNull();
        });

        it('should overwrite existing values', async () => {
            await cache.set('key', 'value1');
            await cache.set('key', 'value2');

            const result = await cache.get('key');

            expect(result).toBe('value2');
        });
    });

    describe('TTL', () => {
        it('should expire values after TTL', async () => {
            await cache.set('expiring', 'value', 1); // 1 second TTL

            // Value should be present immediately
            expect(await cache.get('expiring')).toBe('value');

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Value should be expired
            expect(await cache.get('expiring')).toBeNull();
        });

        it('should not expire values without TTL', async () => {
            await cache.set('permanent', 'value');

            // Simulate time passing (we can't actually wait, but entry has no expiresAt)
            const result = await cache.get('permanent');

            expect(result).toBe('value');
        });
    });

    describe('delete', () => {
        it('should remove values', async () => {
            await cache.set('toDelete', 'value');
            await cache.delete('toDelete');

            expect(await cache.get('toDelete')).toBeNull();
        });

        it('should not error on non-existent keys', async () => {
            await expect(cache.delete('nonexistent')).resolves.toBeUndefined();
        });
    });

    describe('has', () => {
        it('should return true for existing keys', async () => {
            await cache.set('exists', 'value');

            expect(await cache.has('exists')).toBe(true);
        });

        it('should return false for non-existent keys', async () => {
            expect(await cache.has('nonexistent')).toBe(false);
        });
    });

    describe('clear', () => {
        it('should remove all entries', async () => {
            await cache.set('key1', 'value1');
            await cache.set('key2', 'value2');
            await cache.clear();

            expect(cache.size()).toBe(0);
            expect(await cache.get('key1')).toBeNull();
            expect(await cache.get('key2')).toBeNull();
        });
    });

    describe('getMany/setMany', () => {
        it('should get multiple values', async () => {
            await cache.set('a', 1);
            await cache.set('b', 2);

            const results = await cache.getMany<number>(['a', 'b', 'c']);

            expect(results.get('a')).toBe(1);
            expect(results.get('b')).toBe(2);
            expect(results.get('c')).toBeNull();
        });

        it('should set multiple values', async () => {
            await cache.setMany([
                { key: 'x', value: 10 },
                { key: 'y', value: 20, ttlSeconds: 60 }
            ]);

            expect(await cache.get('x')).toBe(10);
            expect(await cache.get('y')).toBe(20);
        });
    });

    describe('cleanup', () => {
        it('should remove expired entries', async () => {
            await cache.set('expired', 'value', 0.1); // Very short TTL
            await cache.set('valid', 'value', 60);

            await new Promise(resolve => setTimeout(resolve, 150));

            const cleaned = cache.cleanup();

            expect(cleaned).toBe(1);
            expect(await cache.get('expired')).toBeNull();
            expect(await cache.get('valid')).toBe('value');
        });
    });
});
