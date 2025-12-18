import fs from 'fs';
import path from 'path';
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
 * Job manager with file-based persistence.
 * Ensures jobs survive restarts during long creation processes.
 */
export class JobManager {
    private jobs: Map<string, ReelJob> = new Map();
    private readonly defaultDurationRange: { min: number; max: number };
    private readonly persistencePath: string;

    constructor(minReelSeconds: number = 10, maxReelSeconds: number = 90) {
        this.defaultDurationRange = { min: minReelSeconds, max: maxReelSeconds };
        this.persistencePath = path.resolve(process.cwd(), 'data/jobs.json');
        this.ensureDataDir();
        this.loadFromDisk();
    }

    private ensureDataDir() {
        const dir = path.dirname(this.persistencePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private loadFromDisk() {
        try {
            if (fs.existsSync(this.persistencePath)) {
                const data = fs.readFileSync(this.persistencePath, 'utf-8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([id, job]: [string, any]) => {
                    // Convert date strings back to Date objects
                    job.createdAt = new Date(job.createdAt);
                    job.updatedAt = new Date(job.updatedAt);
                    if (job.completedAt) job.completedAt = new Date(job.completedAt);
                    this.jobs.set(id, job as ReelJob);
                });
                console.log(`Loaded ${this.jobs.size} jobs from disk`);
            }
        } catch (error) {
            console.error('Failed to load jobs from disk:', error);
        }
    }

    private saveToDisk() {
        try {
            const data = Object.fromEntries(this.jobs);
            fs.writeFileSync(this.persistencePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Failed to save jobs to disk:', error);
        }
    }

    /**
     * Creates a new reel job.
     */
    createJob(input: ReelJobInput): ReelJob {
        const id = `job_${uuidv4().substring(0, 8)}`;
        const job = createReelJob(id, input, this.defaultDurationRange);
        this.jobs.set(id, job);
        this.saveToDisk();
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
        this.saveToDisk();
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
        this.saveToDisk();
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
        this.saveToDisk();
        return failed;
    }

    /**
     * Gets all jobs.
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
     * Clears all jobs.
     */
    clear(): void {
        this.jobs.clear();
        this.saveToDisk();
    }
}
