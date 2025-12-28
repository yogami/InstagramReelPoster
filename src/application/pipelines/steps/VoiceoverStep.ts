
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { VoiceoverService } from '../../services/VoiceoverService';
import { JobManager } from '../../JobManager';
import { SegmentContent } from '../../../domain/ports/ILlmClient';

export class VoiceoverStep implements PipelineStep {
    readonly name = 'Voiceover';

    constructor(
        private readonly voiceoverService: VoiceoverService,
        private readonly jobManager: JobManager
    ) { }

    async execute(context: JobContext): Promise<JobContext> {
        const { job, plan, segmentContent } = context;

        // Skip if already done
        if (context.voiceoverUrl) {
            return context;
        }

        if (!segmentContent || segmentContent.length === 0) {
            // Might be parable mode handled differently? 
            console.warn(`[${job.id}] No segment content for voiceover`);
            return context;
        }

        const fullCommentary = segmentContent.map(s => s.commentary).join(' ');

        console.log(`[${job.id}] Synthesizing voiceover (${fullCommentary.length} chars)...`);

        // Use VoiceoverService
        const { voiceoverUrl, voiceoverDuration: durationSeconds } = await this.voiceoverService.synthesize(
            fullCommentary,
            plan!.targetDurationSeconds,
            job.voiceId
        );

        console.log(`[${job.id}] Voiceover generated: ${durationSeconds}s`);

        // Check if we need to build Segments here?
        // ReelOrchestrator builds "segments" (entity) from "segmentContent" + duration
        // This logic belongs here or in a separate "SegmentBuilderStep"? 
        // Let's put it here to match workflow flow: Content -> Voice -> Build Segments

        // Basic linear timing (logic from ReelOrchestrator.buildSegments)
        const segments = this.buildSegments(segmentContent, durationSeconds);

        await this.jobManager.updateJob(job.id, {
            fullCommentary,
            voiceoverUrl,
            voiceoverDurationSeconds: durationSeconds,
            segments
        });

        return {
            ...context,
            voiceoverUrl,
            voiceoverDuration: durationSeconds,
            segments
        };
    }

    private buildSegments(content: SegmentContent[], totalDuration: number): any[] {
        // Simple equal distribution for now (ReelOrchestrator has more complex logic?)
        // Let's copy simple logic. 
        // Actually, Orchestrator uses words-based distribution.
        const totalWords = content.reduce((sum, s) => sum + s.commentary.split(' ').length, 0);
        let currentTime = 0;

        return content.map((segment, index) => {
            const wordCount = segment.commentary.split(' ').length;
            const duration = (wordCount / totalWords) * totalDuration;
            const startTime = currentTime;
            currentTime += duration;

            return {
                index,
                commentary: segment.commentary,
                imagePrompt: segment.imagePrompt,
                caption: segment.caption,
                startTime: startTime,
                duration: duration,
                endTime: startTime + duration
            };
        });
    }
}
