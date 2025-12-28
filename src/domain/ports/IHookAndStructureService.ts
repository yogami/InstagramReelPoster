import { HookPlan } from '../entities/Growth';
import { ReelPlan } from './ILlmClient';

/**
 * Service for optimizing reel hooks and structure for retention and discovery.
 */
export interface IHookAndStructureService {
    /**
     * Optimizes the reel structure and generates hooks.
     * @param transcript Full transcript from Whisper
     * @param currentPlan Initial plan from LLM
     * @param trendContext Optional trend context
     * @param reelMode Optional reel mode (discovery vs deep-dive)
     * @returns Optimized HookPlan
     */
    optimizeStructure(
        transcript: string,
        currentPlan: ReelPlan,
        trendContext?: string,
        reelMode?: 'discovery' | 'deep-dive'
    ): Promise<HookPlan>;
}
