/**
 * Unit Tests for RetryUtils
 */

import { withRetry, isRetryableHttpError, makeRetryable } from '../../../src/slices/website-promo/infrastructure/RetryUtils';

describe('RetryUtils', () => {
    describe('withRetry', () => {
        it('should return result on first successful attempt', async () => {
            const fn = jest.fn().mockResolvedValue('success');

            const result = await withRetry(fn);

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry on failure and succeed', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Transient'))
                .mockResolvedValueOnce('success');

            const result = await withRetry(fn, {
                maxAttempts: 3,
                initialBackoffMs: 10
            });

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });

        it('should throw after max attempts', async () => {
            const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

            await expect(withRetry(fn, {
                maxAttempts: 3,
                initialBackoffMs: 10
            })).rejects.toThrow('Persistent failure');

            expect(fn).toHaveBeenCalledTimes(3);
        });

        it('should call onRetry callback', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce(new Error('Error 1'))
                .mockRejectedValueOnce(new Error('Error 2'))
                .mockResolvedValueOnce('success');

            const onRetry = jest.fn();

            await withRetry(fn, {
                maxAttempts: 3,
                initialBackoffMs: 10,
                onRetry
            });

            expect(onRetry).toHaveBeenCalledTimes(2);
            expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error), expect.any(Number));
        });

        it('should not retry non-retryable errors', async () => {
            const fn = jest.fn().mockRejectedValue({ status: 400 });

            await expect(withRetry(fn, {
                maxAttempts: 3,
                initialBackoffMs: 10,
                isRetryable: isRetryableHttpError
            })).rejects.toEqual({ status: 400 });

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('should retry rate limit errors', async () => {
            const fn = jest.fn()
                .mockRejectedValueOnce({ response: { status: 429 } })
                .mockResolvedValueOnce('success');

            const result = await withRetry(fn, {
                maxAttempts: 3,
                initialBackoffMs: 10,
                isRetryable: isRetryableHttpError
            });

            expect(result).toBe('success');
            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('isRetryableHttpError', () => {
        it('should return true for 429 rate limit', () => {
            expect(isRetryableHttpError({ response: { status: 429 } })).toBe(true);
        });

        it('should return true for 5xx errors', () => {
            expect(isRetryableHttpError({ response: { status: 500 } })).toBe(true);
            expect(isRetryableHttpError({ response: { status: 502 } })).toBe(true);
            expect(isRetryableHttpError({ response: { status: 503 } })).toBe(true);
        });

        it('should return false for 4xx errors (except 429)', () => {
            expect(isRetryableHttpError({ response: { status: 400 } })).toBe(false);
            expect(isRetryableHttpError({ response: { status: 401 } })).toBe(false);
            expect(isRetryableHttpError({ response: { status: 404 } })).toBe(false);
        });

        it('should return true for network errors (no status)', () => {
            expect(isRetryableHttpError({ message: 'Network Error' })).toBe(true);
        });
    });

    describe('makeRetryable', () => {
        it('should create a retryable function', async () => {
            let callCount = 0;
            const originalFn = async (x: number) => {
                callCount++;
                if (callCount < 2) throw new Error('Transient');
                return x * 2;
            };

            const retryableFn = makeRetryable(originalFn, {
                maxAttempts: 3,
                initialBackoffMs: 10
            });

            const result = await retryableFn(5);

            expect(result).toBe(10);
            expect(callCount).toBe(2);
        });
    });
});
