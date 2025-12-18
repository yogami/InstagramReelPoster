import fs from 'fs';
import path from 'path';
import { JobManager } from '../../../src/application/JobManager';
import { ReelJobInput } from '../../../src/domain/entities/ReelJob';

describe('JobManager Edge Cases', () => {
    const testDataDir = path.resolve(__dirname, 'test_data');
    const testJobsPath = path.join(testDataDir, 'test_jobs.json');

    beforeEach(() => {
        // Clean up test directory
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
        fs.mkdirSync(testDataDir, { recursive: true });
    });

    afterAll(() => {
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true });
        }
    });

    describe('Job creation', () => {
        it('should create jobs with unique IDs', async () => {
            const manager = new JobManager(10, 90);
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.mp3',
                targetDurationRange: { min: 10, max: 30 },
            };

            const job1 = await manager.createJob(input);
            const job2 = await manager.createJob(input);
            const job3 = await manager.createJob(input);

            expect(job1.id).not.toBe(job2.id);
            expect(job2.id).not.toBe(job3.id);
            expect(job1.id).toMatch(/^job_[a-f0-9]+$/);
        });

        it('should use default duration range from constructor', async () => {
            const manager = new JobManager(15, 60);
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.mp3',
            };

            const job = await manager.createJob(input);

            expect(job.targetDurationRange.min).toBe(15);
            expect(job.targetDurationRange.max).toBe(60);
        });

        it('should override default duration range when provided', async () => {
            const manager = new JobManager(15, 60);
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.mp3',
                targetDurationRange: { min: 20, max: 45 },
            };

            const job = await manager.createJob(input);

            expect(job.targetDurationRange.min).toBe(20);
            expect(job.targetDurationRange.max).toBe(45);
        });
    });

    describe('Job retrieval', () => {
        it('should return null for non-existent job ID', async () => {
            const manager = new JobManager(10, 90);

            const job = await manager.getJob('non_existent_id');

            expect(job).toBeNull();
        });

        it('should retrieve created job by ID', async () => {
            const manager = new JobManager(10, 90);
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.mp3',
            };

            const created = await manager.createJob(input);
            const retrieved = await manager.getJob(created.id);

            expect(retrieved).not.toBeNull();
            expect(retrieved?.id).toBe(created.id);
            expect(retrieved?.sourceAudioUrl).toBe(input.sourceAudioUrl);
        });
    });

    describe('Job status updates', () => {
        it('should update job status', async () => {
            const manager = new JobManager(10, 90);
            const job = await manager.createJob({
                sourceAudioUrl: 'https://example.com/audio.mp3',
            });

            const updated = await manager.updateStatus(job.id, 'transcribing', 'Transcribing audio...');

            expect(updated?.status).toBe('transcribing');
            expect(updated?.currentStep).toBe('Transcribing audio...');
        });

        it('should return null when updating non-existent job', async () => {
            const manager = new JobManager(10, 90);

            const result = await manager.updateStatus('fake_id', 'transcribing');

            expect(result).toBeNull();
        });
    });

    describe('Job partial updates', () => {
        it('should update job with partial data', async () => {
            const manager = new JobManager(10, 90);
            const job = await manager.createJob({
                sourceAudioUrl: 'https://example.com/audio.mp3',
            });

            const updated = await manager.updateJob(job.id, {
                transcript: 'Test transcript',
                voiceoverUrl: 'https://example.com/voiceover.mp3',
            });

            expect(updated?.transcript).toBe('Test transcript');
            expect(updated?.voiceoverUrl).toBe('https://example.com/voiceover.mp3');
            expect(updated?.sourceAudioUrl).toBe('https://example.com/audio.mp3'); // Original preserved
        });

        it('should update updatedAt timestamp on partial update', async () => {
            const manager = new JobManager(10, 90);
            const job = await manager.createJob({
                sourceAudioUrl: 'https://example.com/audio.mp3',
            });

            const originalUpdatedAt = job.updatedAt;

            // Small delay to ensure timestamp difference
            await new Promise(resolve => setTimeout(resolve, 10));

            const updated = await manager.updateJob(job.id, { transcript: 'Test' });

            expect(updated?.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
        });
    });

    describe('Job failure handling', () => {
        it('should mark job as failed with error message', async () => {
            const manager = new JobManager(10, 90);
            const job = await manager.createJob({
                sourceAudioUrl: 'https://example.com/audio.mp3',
            });

            const failed = await manager.failJob(job.id, 'TTS synthesis failed: Rate limit exceeded');

            expect(failed?.status).toBe('failed');
            expect(failed?.error).toBe('TTS synthesis failed: Rate limit exceeded');
        });

        it('should return null when failing non-existent job', async () => {
            const manager = new JobManager(10, 90);

            const result = await manager.failJob('fake_id', 'Error');

            expect(result).toBeNull();
        });
    });

    describe('Get all jobs', () => {
        it('should return all created jobs', async () => {
            const manager = new JobManager(10, 90);

            await manager.createJob({ sourceAudioUrl: 'https://example.com/1.mp3' });
            await manager.createJob({ sourceAudioUrl: 'https://example.com/2.mp3' });
            await manager.createJob({ sourceAudioUrl: 'https://example.com/3.mp3' });

            const allJobs = await manager.getAllJobs();

            expect(allJobs.length).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Get jobs by status', () => {
        it('should filter jobs by status', async () => {
            const manager = new JobManager(10, 90);

            const job1 = await manager.createJob({ sourceAudioUrl: 'https://example.com/1.mp3' });
            const job2 = await manager.createJob({ sourceAudioUrl: 'https://example.com/2.mp3' });
            await manager.createJob({ sourceAudioUrl: 'https://example.com/3.mp3' });

            await manager.updateStatus(job1.id, 'transcribing');
            await manager.updateStatus(job2.id, 'transcribing');

            const transcribingJobs = await manager.getJobsByStatus('transcribing');

            // At least these 2 jobs should be transcribing
            expect(transcribingJobs.length).toBeGreaterThanOrEqual(2);
            expect(transcribingJobs.every(j => j.status === 'transcribing')).toBe(true);
        });
    });

    describe('Clear jobs', () => {
        it('should clear all jobs', async () => {
            const manager = new JobManager(10, 90);

            await manager.createJob({ sourceAudioUrl: 'https://example.com/1.mp3' });
            await manager.createJob({ sourceAudioUrl: 'https://example.com/2.mp3' });

            await manager.clear();

            const allJobs = await manager.getAllJobs();
            expect(allJobs.length).toBe(0);
        });
    });
});
