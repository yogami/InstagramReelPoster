/**
 * Metrics Port Interface
 * 
 * Defines the contract for observability and metrics collection.
 * Implementations: Console, Prometheus, Datadog, etc.
 */

export interface MetricTags {
    [key: string]: string | number | boolean;
}

export interface IMetricsPort {
    /**
     * Increment a counter metric.
     * @param name - Metric name (e.g., 'website_promo.jobs_processed')
     * @param tags - Optional tags for filtering/grouping
     * @param value - Increment amount (default: 1)
     */
    incrementCounter(name: string, tags?: MetricTags, value?: number): void;

    /**
     * Record a duration/timing metric.
     * @param name - Metric name (e.g., 'website_promo.scrape_duration_ms')
     * @param durationMs - Duration in milliseconds
     * @param tags - Optional tags for filtering/grouping
     */
    recordDuration(name: string, durationMs: number, tags?: MetricTags): void;

    /**
     * Record a gauge metric (current value at a point in time).
     * @param name - Metric name (e.g., 'website_promo.active_jobs')
     * @param value - Current value
     * @param tags - Optional tags for filtering/grouping
     */
    recordGauge(name: string, value: number, tags?: MetricTags): void;

    /**
     * Record a histogram metric (distribution of values).
     * @param name - Metric name
     * @param value - Value to record
     * @param tags - Optional tags
     */
    recordHistogram(name: string, value: number, tags?: MetricTags): void;

    /**
     * Start a timer and return a function to stop it.
     * Useful for measuring async operation durations.
     */
    startTimer(name: string, tags?: MetricTags): () => void;

    /**
     * Flush any buffered metrics (for batch sending implementations).
     */
    flush(): Promise<void>;
}

/**
 * Standard metric names for the Website Promo slice.
 */
export const METRICS = {
    // Counters
    JOBS_PROCESSED: 'website_promo.jobs_processed',
    JOBS_FAILED: 'website_promo.jobs_failed',
    SCRAPES_TOTAL: 'website_promo.scrapes_total',
    IMAGES_GENERATED: 'website_promo.images_generated',
    TRANSLATIONS_PERFORMED: 'website_promo.translations_performed',
    CACHE_HITS: 'website_promo.cache_hits',
    CACHE_MISSES: 'website_promo.cache_misses',
    RETRIES_TOTAL: 'website_promo.retries_total',

    // Durations
    SCRAPE_DURATION: 'website_promo.scrape_duration_ms',
    SCRIPT_GENERATION_DURATION: 'website_promo.script_generation_duration_ms',
    IMAGE_GENERATION_DURATION: 'website_promo.image_generation_duration_ms',
    RENDER_DURATION: 'website_promo.render_duration_ms',
    TOTAL_JOB_DURATION: 'website_promo.total_job_duration_ms',

    // Gauges
    ACTIVE_JOBS: 'website_promo.active_jobs',
    BATCH_SIZE: 'website_promo.batch_size',

    // Histograms
    SCRIPT_LENGTH: 'website_promo.script_length_chars',
    VIDEO_DURATION: 'website_promo.video_duration_seconds'
} as const;
