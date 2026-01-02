/**
 * Retry Utilities
 * 
 * Provides exponential backoff retry logic for transient failures.
 * Used to wrap external API calls in adapters.
 */

export interface RetryOptions {
    /** Maximum number of attempts (default: 3) */
    maxAttempts?: number;
    /** Initial backoff delay in milliseconds (default: 1000) */
    initialBackoffMs?: number;
    /** Maximum backoff delay in milliseconds (default: 30000) */
    maxBackoffMs?: number;
    /** Backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** Optional jitter to add randomness (0-1, default: 0.1) */
    jitter?: number;
    /** Function to determine if error is retryable (default: all errors) */
    isRetryable?: (error: any) => boolean;
    /** Callback for each retry attempt */
    onRetry?: (attempt: number, error: any, nextDelayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
    maxAttempts: 3,
    initialBackoffMs: 1000,
    maxBackoffMs: 30000,
    backoffMultiplier: 2,
    jitter: 0.1,
    isRetryable: () => true,
    onRetry: () => { }
};

/**
 * Execute a function with exponential backoff retry logic.
 * 
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
    fn: () => Promise<T>,
    options?: RetryOptions
): Promise<T> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    let lastError: any;
    let currentBackoff = opts.initialBackoffMs;

    for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;

            // Check if we should retry
            if (attempt === opts.maxAttempts || !opts.isRetryable(error)) {
                throw error;
            }

            // Calculate delay with jitter
            const jitterAmount = currentBackoff * opts.jitter * (Math.random() * 2 - 1);
            const delay = Math.min(currentBackoff + jitterAmount, opts.maxBackoffMs);

            // Notify about retry
            opts.onRetry(attempt, error, delay);

            // Wait before retrying
            await sleep(delay);

            // Increase backoff for next attempt
            currentBackoff = Math.min(currentBackoff * opts.backoffMultiplier, opts.maxBackoffMs);
        }
    }

    throw lastError;
}

/**
 * Check if an HTTP error is retryable based on status code.
 */
export function isRetryableHttpError(error: any): boolean {
    const status = error.response?.status || error.status;

    // Retry on rate limits (429), server errors (5xx), or network errors
    if (!status) {
        // Network error (no response)
        return true;
    }

    if (status === 429) {
        // Rate limited - definitely retry
        return true;
    }

    if (status >= 500 && status < 600) {
        // Server error - retry
        return true;
    }

    // Client errors (4xx except 429) are not retryable
    return false;
}

/**
 * Helper to sleep for a specified duration.
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a retryable version of a function.
 */
export function makeRetryable<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    options?: RetryOptions
): T {
    return ((...args: Parameters<T>) => {
        return withRetry(() => fn(...args), options);
    }) as T;
}
