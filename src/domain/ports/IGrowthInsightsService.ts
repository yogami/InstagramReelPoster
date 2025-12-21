import { ReelAnalytics } from '../entities/Growth';

/**
 * Service for tracking performance and deriving growth insights.
 */
export interface IGrowthInsightsService {
    /**
     * Records analytics for a specific reel.
     * @param analytics Performance data
     */
    recordAnalytics(analytics: ReelAnalytics): Promise<void>;

    /**
     * Retrieves analytics for a specific reel.
     * @param reelId Internal job ID or external IG ID
     */
    getAnalytics(reelId: string): Promise<ReelAnalytics | null>;

    /**
     * Lists all past reel analytics.
     */
    listAnalytics(): Promise<ReelAnalytics[]>;
}
