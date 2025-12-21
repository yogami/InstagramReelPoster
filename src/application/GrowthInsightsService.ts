import { IGrowthInsightsService } from '../domain/ports/IGrowthInsightsService';
import { ReelAnalytics } from '../domain/entities/Growth';

/**
 * Service for tracking performance and deriving growth insights.
 * Initial implementation uses in-memory or simple storage (to be expanded).
 */
export class GrowthInsightsService implements IGrowthInsightsService {
    private analyticsStore: Map<string, ReelAnalytics> = new Map();

    async recordAnalytics(analytics: ReelAnalytics): Promise<void> {
        console.log(`[GrowthInsights] Recording analytics for reel: ${analytics.reelId}`);
        this.analyticsStore.set(analytics.reelId, analytics);
    }

    async getAnalytics(reelId: string): Promise<ReelAnalytics | null> {
        return this.analyticsStore.get(reelId) || null;
    }

    async listAnalytics(): Promise<ReelAnalytics[]> {
        return Array.from(this.analyticsStore.values());
    }
}
