import { IHookAndStructureService } from '../domain/ports/IHookAndStructureService';
import { HookPlan, HookStyle } from '../domain/entities/Growth';
import { ILLMClient, ReelPlan } from '../domain/ports/ILLMClient';

/**
 * Service for optimizing reel hooks and structure for retention and discovery.
 */
export class HookAndStructureService implements IHookAndStructureService {
    constructor(private readonly llmClient: ILLMClient) { }

    /**
     * Optimizes the reel structure and generates hooks.
     * @param transcript - The reel transcript
     * @param currentPlan - The current reel plan
     * @param trendContext - Optional trend context to bend hooks toward current topics
     */
    async optimizeStructure(
        transcript: string,
        currentPlan: ReelPlan,
        trendContext?: string,
        reelMode?: 'discovery' | 'deep-dive'
    ): Promise<HookPlan> {
        // 1. Generate Hooks via LLM (with trend context if provided)
        const hooks = await this.llmClient.generateHooks(transcript, currentPlan, trendContext);
        const chosenHook = hooks[0] || "Discover the truth.";
        const alternativeHooks = hooks.slice(1);

        // 2. Classify hook style for analytics
        const hookStyle = this.classifyHookStyle(chosenHook);

        // 3. Optimize Duration for Retention
        let optimizedDuration = currentPlan.targetDurationSeconds;

        if (reelMode === 'discovery') {
            // Discovery Mode: Strictly 10-25 seconds for maximum reach
            if (optimizedDuration > 25) {
                optimizedDuration = Math.max(15, Math.min(optimizedDuration * 0.7, 25));
            }
        } else if (reelMode === 'deep-dive') {
            // Deep-dive Mode: Allow 25-60 seconds for complex topics/series
            // We still clamp slightly to avoid boring the user, but much more relaxed
            optimizedDuration = Math.max(25, Math.min(optimizedDuration, 60));
        } else {
            // No mode specified: default behavior (moderate clamping if very long)
            if (optimizedDuration > 45) {
                optimizedDuration = Math.min(optimizedDuration, 60); // Respect high duration if plan said so
            }
        }

        // 4. Segment Mapping (Hook -> Body -> Payoff)
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
            hookStyle,
            segmentsHint
        };
    }

    /**
     * Classifies the hook style based on linguistic patterns.
     */
    private classifyHookStyle(hook: string): HookStyle {
        const lowerHook = hook.toLowerCase();

        // Question pattern
        if (hook.includes('?') || lowerHook.startsWith('why') || lowerHook.startsWith('what') ||
            lowerHook.startsWith('how') || lowerHook.startsWith('when') || lowerHook.startsWith('do you')) {
            return 'question';
        }

        // Call-out pattern (addressing "you" directly)
        if (lowerHook.startsWith('you') || lowerHook.includes('your ') || lowerHook.startsWith('stop ') ||
            lowerHook.startsWith('listen')) {
            return 'call-out';
        }

        // Paradox pattern (contradictions, "but" in first line)
        if (lowerHook.includes(' but ') || lowerHook.includes('actually') ||
            lowerHook.includes('the opposite') || lowerHook.includes('wrong')) {
            return 'paradox';
        }

        // Shocking fact pattern (numbers, percentages, absolutes)
        if (/\d+%/.test(hook) || /^\d/.test(hook) || lowerHook.includes('never') ||
            lowerHook.includes('always') || lowerHook.includes('every')) {
            return 'shocking-fact';
        }

        // Default to statement
        return 'statement';
    }
}
