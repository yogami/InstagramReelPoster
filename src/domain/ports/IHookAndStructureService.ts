import { HookPlan } from '../entities/Growth';
import { ReelPlan } from './ILLMClient';

/**
 * Service for optimizing reel hooks and structure for retention and discovery.
 */
export interface IHookAndStructureService {
    /**
     * Optimizes the reel structure and generates hooks.
     * @param transcript Full transcript from Whisper
     * @param currentPlan Initial plan from LLM
     * @returns Optimized HookPlan
     */
    optimizeStructure(transcript: string, currentPlan: ReelPlan): Promise<HookPlan>;
}
