import { IHookAndStructureService } from '../domain/ports/IHookAndStructureService';
import { HookPlan, HookStyle } from '../domain/entities/Growth';
import { ILlmClient, ReelPlan } from '../domain/ports/ILlmClient';

/**
 * Service for optimizing reel hooks and structure for retention and discovery.
 */
export class HookAndStructureService implements IHookAndStructureService {
    constructor(private readonly llmClient: ILlmClient) { }

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
     * Uses data-driven pattern matching for complexity ≤3.
     */
    private classifyHookStyle(hook: string): HookStyle {
        const lowerHook = hook.toLowerCase();
        return this.matchHookPattern(hook, lowerHook);
    }

    private matchHookPattern(hook: string, lowerHook: string): HookStyle {
        const patterns: Array<{ style: HookStyle; matcher: () => boolean }> = [
            { style: 'question', matcher: () => this.isQuestion(hook, lowerHook) },
            { style: 'call-out', matcher: () => this.isCallOut(lowerHook) },
            { style: 'paradox', matcher: () => this.isParadox(lowerHook) },
            { style: 'shocking-fact', matcher: () => this.isShockingFact(hook, lowerHook) },
        ];

        const match = patterns.find(p => p.matcher());
        return match?.style ?? 'statement';
    }

    private isQuestion(hook: string, lowerHook: string): boolean {
        const questionStarters = ['why', 'what', 'how', 'when', 'do you'];
        return hook.includes('?') || questionStarters.some(s => lowerHook.startsWith(s));
    }

    private isCallOut(lowerHook: string): boolean {
        const callOutStarters = ['you', 'stop ', 'listen'];
        return callOutStarters.some(s => lowerHook.startsWith(s)) || lowerHook.includes('your ');
    }

    private isParadox(lowerHook: string): boolean {
        const paradoxMarkers = [' but ', 'actually', 'the opposite', 'wrong'];
        return paradoxMarkers.some(m => lowerHook.includes(m));
    }

    private isShockingFact(hook: string, lowerHook: string): boolean {
        const absoluteWords = ['never', 'always', 'every'];
        return /\d+%/.test(hook) || /^\d/.test(hook) || absoluteWords.some(w => lowerHook.includes(w));
    }
}
