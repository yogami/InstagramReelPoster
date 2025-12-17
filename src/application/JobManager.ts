import { v4 as uuidv4 } from 'uuid';
import {
    ReelJob,
    ReelJobInput,
    ReelJobStatus,
    createReelJob,
    updateJobStatus,
    failJob,
} from '../domain/entities/ReelJob';

/**
 * In-memory job storage and management.
 * In production, this would be backed by Redis or a database.
 */
export class JobManager {
    private jobs: Map<string, ReelJob> = new Map();
    private readonly defaultDurationRange: { min: number; max: number };

    constructor(minReelSeconds: number = 10, maxReelSeconds: number = 90) {
        this.defaultDurationRange = { min: minReelSeconds, max: maxReelSeconds };
    }

    /**
     * Creates a new reel job.
     */
    createJob(input: ReelJobInput): ReelJob {
        const id = `job_${uuidv4().substring(0, 8)}`;
        const job = createReelJob(id, input, this.defaultDurationRange);
        this.jobs.set(id, job);
        return job;
    }

    /**
     * Gets a job by ID.
     */
    getJob(id: string): ReelJob | null {
        return this.jobs.get(id) || null;
    }

    /**
     * Updates a job's status.
     */
    updateStatus(id: string, status: ReelJobStatus, currentStep?: string): ReelJob | null {
        const job = this.jobs.get(id);
        if (!job) {
            return null;
        }
        const updated = updateJobStatus(job, status, currentStep);
        this.jobs.set(id, updated);
        return updated;
    }

    /**
     * Updates a job with partial data.
     */
    updateJob(id: string, updates: Partial<ReelJob>): ReelJob | null {
        const job = this.jobs.get(id);
        if (!job) {
            return null;
        }
        const updated: ReelJob = {
            ...job,
            ...updates,
            updatedAt: new Date(),
        };
        this.jobs.set(id, updated);
        return updated;
    }

    /**
     * Marks a job as failed.
     */
    failJob(id: string, error: string): ReelJob | null {
        const job = this.jobs.get(id);
        if (!job) {
            return null;
        }
        const failed = failJob(job, error);
        this.jobs.set(id, failed);
        return failed;
    }

    /**
     * Gets all jobs (for debugging/monitoring).
     */
    getAllJobs(): ReelJob[] {
        return Array.from(this.jobs.values());
    }

    /**
     * Gets jobs by status.
     */
    getJobsByStatus(status: ReelJobStatus): ReelJob[] {
        return Array.from(this.jobs.values()).filter((job) => job.status === status);
    }

    /**
     * Clears all jobs (useful for testing).
     */
    clear(): void {
        this.jobs.clear();
    }
}
