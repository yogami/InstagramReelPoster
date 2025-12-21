import { IHookAndStructureService } from '../domain/ports/IHookAndStructureService';
import { HookPlan } from '../domain/entities/Growth';
import { ILLMClient, ReelPlan } from '../domain/ports/ILLMClient';

/**
 * Service for optimizing reel hooks and structure for retention and discovery.
 */
export class HookAndStructureService implements IHookAndStructureService {
    constructor(private readonly llmClient: ILLMClient) { }

    /**
     * Optimizes the reel structure and generates hooks.
     */
    async optimizeStructure(transcript: string, currentPlan: ReelPlan): Promise<HookPlan> {
        // 1. Generate Hooks via LLM
        const hooks = await this.llmClient.generateHooks(transcript, currentPlan);
        const chosenHook = hooks[0] || "Discover the truth.";
        const alternativeHooks = hooks.slice(1);

        // 2. Optimize Duration for Retention (Discovery Bias)
        // Target: 10-20 seconds for discovery, unless story warrants more.
        // We'll clamp the target duration to be more viral-friendly.
        let optimizedDuration = currentPlan.targetDurationSeconds;

        if (optimizedDuration > 20) {
            // If much longer, we try to condense it for higher completion rates
            optimizedDuration = Math.max(15, Math.min(optimizedDuration * 0.7, 25));
        }

        // 3. Segment Mapping (Hook -> Body -> Payoff)
        // We need at least 3 segments for this structure
        let segmentCount = Math.max(3, Math.round(optimizedDuration / 5));

        // Ensure segmentCount match the duration realistically (minimum 4s per segment for retention)
        if (optimizedDuration / segmentCount < 4) {
            segmentCount = Math.floor(optimizedDuration / 4);
        }
        segmentCount = Math.max(3, segmentCount);

        const segmentsHint: Array<{ index: number; role: "hook" | "body" | "payoff" }> = [];

        for (let i = 0; i < segmentCount; i++) {
            let role: "hook" | "body" | "payoff" = "body";
            if (i === 0) role = "hook";
            else if (i === segmentCount - 1) role = "payoff";

            segmentsHint.push({ index: i, role });
        }

        return {
            chosenHook,
            alternativeHooks,
            targetDurationSeconds: optimizedDuration,
            segmentCount,
            segmentsHint
        };
    }
}
