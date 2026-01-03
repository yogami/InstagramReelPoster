/**
 * Console Metrics Adapter
 * 
 * Logs metrics to console in structured JSON format.
 * Useful for development and debugging.
 * Ready for replacement with Prometheus/Datadog in production.
 */

import { IMetricsPort, MetricTags } from '../ports/IMetricsPort';

export interface ConsoleMetricsOptions {
    /** Prefix for all metric names */
    prefix?: string;
    /** Enable/disable logging (useful for tests) */
    enabled?: boolean;
    /** Log level: 'debug' | 'info' */
    logLevel?: 'debug' | 'info';
}

export class ConsoleMetricsAdapter implements IMetricsPort {
    private readonly prefix: string;
    private readonly enabled: boolean;
    private readonly logLevel: 'debug' | 'info';

    constructor(options?: ConsoleMetricsOptions) {
        this.prefix = options?.prefix || '';
        this.enabled = options?.enabled ?? true;
        this.logLevel = options?.logLevel || 'info';
    }

    private formatMetricName(name: string): string {
        return this.prefix ? `${this.prefix}.${name}` : name;
    }

    private log(type: string, name: string, value: number, tags?: MetricTags): void {
        if (!this.enabled) return;

        const metric = {
            type,
            name: this.formatMetricName(name),
            value,
            tags: tags || {},
            timestamp: new Date().toISOString()
        };

        const logFn = this.logLevel === 'debug' ? console.debug : console.log;
        logFn(`[Metrics] ${JSON.stringify(metric)}`);
    }

    incrementCounter(name: string, tags?: MetricTags, value: number = 1): void {
        this.log('counter', name, value, tags);
    }

    recordDuration(name: string, durationMs: number, tags?: MetricTags): void {
        this.log('duration', name, durationMs, tags);
    }

    recordGauge(name: string, value: number, tags?: MetricTags): void {
        this.log('gauge', name, value, tags);
    }

    recordHistogram(name: string, value: number, tags?: MetricTags): void {
        this.log('histogram', name, value, tags);
    }

    startTimer(name: string, tags?: MetricTags): () => void {
        const startTime = Date.now();
        return () => {
            const duration = Date.now() - startTime;
            this.recordDuration(name, duration, tags);
        };
    }

    async flush(): Promise<void> {
        // Console adapter writes immediately, nothing to flush
    }
}

/**
 * No-op Metrics Adapter for tests or when metrics are disabled.
 */
export class NoOpMetricsAdapter implements IMetricsPort {
    incrementCounter(): void { }
    recordDuration(): void { }
    recordGauge(): void { }
    recordHistogram(): void { }
    startTimer(): () => void { return () => { }; }
    async flush(): Promise<void> { }
}
