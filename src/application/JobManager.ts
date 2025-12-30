import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import {
    ReelJob,
    ReelJobInput,
    ReelJobStatus,
    createReelJob,
    updateJobStatus,
    failJob,
} from '../domain/entities/ReelJob';

/**
 * Job manager with Redis or File-based persistence.
 * Ensures jobs survive restarts during long creation processes.
 */
export class JobManager {
    private jobs: Map<string, ReelJob> = new Map();
    private readonly redis?: Redis;
    private readonly defaultDurationRange: { min: number; max: number };
    private readonly persistencePath: string;
    private readonly REDIS_PREFIX = 'reel_job:';

    constructor(minReelSeconds: number = 10, maxReelSeconds: number = 90, redisUrl?: string) {
        this.defaultDurationRange = { min: minReelSeconds, max: maxReelSeconds };
        this.persistencePath = path.resolve(process.cwd(), 'data/jobs.json');

        if (redisUrl) {
            console.log('⚡ Connecting to Redis for job storage...');
            this.redis = new Redis(redisUrl, {
                maxRetriesPerRequest: 3,
                connectTimeout: 10000, // 10s
                retryStrategy: (times) => {
                    if (times > 3) return null; // stop retrying after 3 attempts
                    return Math.min(times * 200, 2000);
                }
            });
            this.redis.on('error', (err) => {
                console.error('❌ Redis connection error:', err.message);
            });
            this.redis.on('connect', () => {
                console.log('✅ Redis connected successfully');
            });
        }
        else {
            this.ensureDataDir();
            this.loadFromDisk();
        }
    }

    private ensureDataDir() {
        const dir = path.dirname(this.persistencePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private async loadFromDisk() {
        try {
            if (fs.existsSync(this.persistencePath)) {
                const data = fs.readFileSync(this.persistencePath, 'utf-8');
                const parsed = JSON.parse(data);
                Object.entries(parsed).forEach(([id, job]: [string, any]) => {
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

    private async saveToDisk() {
        if (this.redis) return; // Redis saves are inline
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
    async createJob(input: ReelJobInput, explicitId?: string): Promise<ReelJob> {
        const id = explicitId || `job_${uuidv4().substring(0, 8)}`;
        const job = createReelJob(id, input, this.defaultDurationRange);

        if (this.redis) {
            await this.redis.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(job));
            // Index by User (Telegram Chat ID)
            if (input.telegramChatId) {
                await this.redis.set(`${this.REDIS_PREFIX}user_last:${input.telegramChatId}`, id);
            }
        } else {
            this.jobs.set(id, job);
            await this.saveToDisk();
        }
        return job;
    }

    /**
     * Gets the last job created for a specific user.
     */
    async getLastJobForUser(telegramChatId: number): Promise<ReelJob | null> {
        if (this.redis) {
            const jobId = await this.redis.get(`${this.REDIS_PREFIX}user_last:${telegramChatId}`);
            if (!jobId) return null;
            return this.getJob(jobId);
        }

        // In-memory fallback (inefficient scan, but fine for local)
        const userJobs = Array.from(this.jobs.values())
            .filter(j => j.telegramChatId === telegramChatId)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return userJobs.length > 0 ? userJobs[0] : null;
    }

    /**
     * Gets a job by ID.
     */
    async getJob(id: string): Promise<ReelJob | null> {

        if (this.redis) {
            const data = await this.redis.get(`${this.REDIS_PREFIX}${id}`);
            if (!data) return null;
            const job = JSON.parse(data);
            job.createdAt = new Date(job.createdAt);
            job.updatedAt = new Date(job.updatedAt);
            return job as ReelJob;
        }
        return this.jobs.get(id) || null;
    }

    /**
     * Updates a job's status.
     */
    async updateStatus(id: string, status: ReelJobStatus, currentStep?: string): Promise<ReelJob | null> {
        const job = await this.getJob(id);
        if (!job) return null;

        const updated = updateJobStatus(job, status, currentStep);

        if (this.redis) {
            await this.redis.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(updated));
        } else {
            this.jobs.set(id, updated);
            await this.saveToDisk();
        }
        return updated;
    }

    /**
     * Updates a job with partial data.
     */
    async updateJob(id: string, updates: Partial<ReelJob>): Promise<ReelJob | null> {
        const job = await this.getJob(id);
        if (!job) return null;

        const updated: ReelJob = {
            ...job,
            ...updates,
            updatedAt: new Date(),
        };

        if (this.redis) {
            await this.redis.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(updated));
        } else {
            this.jobs.set(id, updated);
            await this.saveToDisk();
        }
        return updated;
    }

    /**
     * Marks a job as failed.
     */
    async failJob(id: string, error: string): Promise<ReelJob | null> {
        const job = await this.getJob(id);
        if (!job) return null;

        const failed = failJob(job, error);

        if (this.redis) {
            await this.redis.set(`${this.REDIS_PREFIX}${id}`, JSON.stringify(failed));
        } else {
            this.jobs.set(id, failed);
            await this.saveToDisk();
        }
        return failed;
    }

    /**
     * Gets all jobs.
     */
    async getAllJobs(): Promise<ReelJob[]> {
        if (this.redis) {
            const keys = await this.redis.keys(`${this.REDIS_PREFIX}*`);
            const jobs: ReelJob[] = [];
            for (const key of keys) {
                const data = await this.redis.get(key);
                if (data) {
                    const job = JSON.parse(data);
                    job.createdAt = new Date(job.createdAt);
                    job.updatedAt = new Date(job.updatedAt);
                    jobs.push(job);
                }
            }
            return jobs;
        }
        return Array.from(this.jobs.values());
    }

    /**
     * Gets jobs by status.
     */
    async getJobsByStatus(status: ReelJobStatus): Promise<ReelJob[]> {
        const jobs = await this.getAllJobs();
        return jobs.filter((job) => job.status === status);
    }

    /**
     * Clears all jobs.
     */
    async clear(): Promise<void> {
        if (this.redis) {
            const keys = await this.redis.keys(`${this.REDIS_PREFIX}*`);
            if (keys.length > 0) {
                await this.redis.del(...keys);
            }
        } else {
            this.jobs.clear();
            await this.saveToDisk();
        }
    }
}
