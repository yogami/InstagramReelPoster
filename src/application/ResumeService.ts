import { JobManager } from './JobManager';
import { ReelOrchestrator } from './ReelOrchestrator';

/**
 * Service that resumes interrupted jobs on application startup.
 */
export class ResumeService {
    private readonly jobManager: JobManager;
    private readonly orchestrator: ReelOrchestrator;

    constructor(jobManager: JobManager, orchestrator: ReelOrchestrator) {
        this.jobManager = jobManager;
        this.orchestrator = orchestrator;
    }

    /**
     * Finds and resumes all non-terminal jobs.
     */
    async resumeAll(): Promise<void> {
        const jobs = await this.jobManager.getAllJobs();
        const activeJobs = jobs.filter(
            (job) => job.status !== 'completed' && job.status !== 'failed'
        );

        if (activeJobs.length === 0) {
            return;
        }

        console.log(`🚀 Resuming ${activeJobs.length} interrupted jobs...`);

        // Resume each job in the background
        for (const job of activeJobs) {
            console.log(`Resuming job ${job.id} (last step: ${job.currentStep || 'unknown'})`);
            this.orchestrator.processJob(job.id).catch((error) => {
                console.error(`Failed to resume job ${job.id}:`, error);
            });
        }
    }
}
