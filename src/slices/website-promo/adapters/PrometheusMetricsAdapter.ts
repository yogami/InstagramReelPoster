import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { IMetricsPort, MetricTags } from '../ports/IMetricsPort';

/**
 * Prometheus Metrics Adapter
 * 
 * Implements IMetricsPort using prom-client for export to Prometheus.
 */
export class PrometheusMetricsAdapter implements IMetricsPort {
    private registry: Registry;
    private counters: Map<string, Counter<string>> = new Map();
    private histograms: Map<string, Histogram<string>> = new Map();
    private gauges: Map<string, Gauge<string>> = new Map();

    constructor(prefix: string = 'instagram_reel_poster_') {
        this.registry = new Registry();
        this.registry.setDefaultLabels({
            app: 'instagram-reel-poster',
            service: 'website-promo'
        });

        collectDefaultMetrics({ register: this.registry, prefix });
    }

    /**
     * Increments a counter.
     */
    incrementCounter(name: string, tags?: MetricTags, value: number = 1): void {
        const metricName = this.sanitizeName(name);
        let counter = this.counters.get(metricName);

        if (!counter) {
            counter = new Counter({
                name: metricName,
                help: `Total count of ${name}`,
                labelNames: tags ? Object.keys(tags) : [],
                registers: [this.registry]
            });
            this.counters.set(metricName, counter);
        }

        if (tags) {
            counter.inc(this.stringifyTags(tags), value);
        } else {
            counter.inc(value);
        }
    }

    /**
     * Records a duration in milliseconds.
     */
    recordDuration(name: string, durationMs: number, tags?: MetricTags): void {
        this.recordHistogram(name, durationMs, tags);
    }

    /**
     * Records a gauge value.
     */
    recordGauge(name: string, value: number, tags?: MetricTags): void {
        const metricName = this.sanitizeName(name);
        let gauge = this.gauges.get(metricName);

        if (!gauge) {
            gauge = new Gauge({
                name: metricName,
                help: `Current value of ${name}`,
                labelNames: tags ? Object.keys(tags) : [],
                registers: [this.registry]
            });
            this.gauges.set(metricName, gauge);
        }

        if (tags) {
            gauge.set(this.stringifyTags(tags), value);
        } else {
            gauge.set(value);
        }
    }

    /**
     * Records a histogram value.
     */
    recordHistogram(name: string, value: number, tags?: MetricTags): void {
        const metricName = this.sanitizeName(name);
        let histogram = this.histograms.get(metricName);

        if (!histogram) {
            histogram = new Histogram({
                name: metricName,
                help: `Distribution of ${name}`,
                labelNames: tags ? Object.keys(tags) : [],
                registers: [this.registry]
            });
            this.histograms.set(metricName, histogram);
        }

        if (tags) {
            histogram.observe(this.stringifyTags(tags), value);
        } else {
            histogram.observe(value);
        }
    }

    /**
     * Starts a timer for an operation.
     */
    startTimer(name: string, tags?: MetricTags): () => void {
        const startTime = Date.now();
        return () => {
            const duration = Date.now() - startTime;
            this.recordDuration(name, duration, tags);
        };
    }

    /**
     * Flushes metrics (No-op for Prometheus pull model).
     */
    async flush(): Promise<void> {
        return Promise.resolve();
    }

    /**
     * Gets the Prometheus-formatted metrics string.
     */
    async getMetrics(): Promise<string> {
        return this.registry.metrics();
    }

    /**
     * Sanitizes metric names for Prometheus (replaces dots with underscores).
     */
    private sanitizeName(name: string): string {
        return name.replace(/\./g, '_');
    }

    /**
     * Converts MetricTags to a string-keyed record for prom-client.
     */
    private stringifyTags(tags: MetricTags): Record<string, string> {
        const result: Record<string, string> = {};
        for (const [key, value] of Object.entries(tags)) {
            result[key] = String(value);
        }
        return result;
    }
}
