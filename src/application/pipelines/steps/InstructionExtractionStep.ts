
import { PipelineStep, JobContext } from '../PipelineInfrastructure';
import { JobManager } from '../../JobManager';

/**
 * Step to extract special instructions from the transcript/prompt,
 * such as "use this exact phrasing".
 */
export class InstructionExtractionStep implements PipelineStep {
    readonly name = 'InstructionExtraction';

    constructor(private readonly jobManager: JobManager) { }

    shouldSkip(context: JobContext): boolean {
        return !!context.job.providedCommentary;
    }

    async execute(context: JobContext): Promise<JobContext> {
        // Check both description (Telegram caption) and transcript (Voice note content)
        const sources = [context.job.description, context.transcript].filter(s => !!s) as string[];

        if (sources.length === 0) return context;

        // Pattern 1: "Use this exact phrasing[:] ... [Poem/Text]"
        // Pattern 2: "with the following words[:] ... [Poem/Text]"
        // Pattern 3: "narrated commentary ... retain ... retain this [Text]"
        const patterns = [
            /use this exact phrasing[:\s]+(["']{1})?([\s\S]+?)\1?$/i,
            /with the following words[:\s]+(["']{1})?([\s\S]+?)\1?$/i,
            /retain (the )?user narrated commentary[:\s]+(["']{1})?([\s\S]+?)\2?$/i,
            /exact phrasing[:\s]+(["']{1})?([\s\S]+?)\1?$/i,
            /retain this[:\s]+(["']{1})?([\s\S]+?)\1?$/i
        ];

        for (const source of sources) {
            for (const pattern of patterns) {
                const match = source.match(pattern);
                if (match) {
                    // Usually the captured group is the last or second to last
                    const extractedText = (match[match.length - 1] || match[match.length - 2] || '').trim();

                    if (extractedText.length > 10) {
                        console.log(`[InstructionExtraction] Found exact phrasing instruction. Extracting ${extractedText.length} chars.`);

                        await this.jobManager.updateJob(context.jobId, {
                            providedCommentary: extractedText
                        });

                        return {
                            ...context,
                            job: {
                                ...context.job,
                                providedCommentary: extractedText
                            }
                        };
                    }
                }
            }
        }

        return context;
    }
}
