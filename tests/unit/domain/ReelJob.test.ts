import {
    createReelJob,
    updateJobStatus,
    failJob,
    completeJob,
    isJobTerminal,
    ReelJob,
    ReelJobInput,
} from '../../../src/domain/entities/ReelJob';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

describe('ReelJob', () => {
    const defaultDurationRange = { min: 10, max: 90 };

    describe('createReelJob', () => {
        it('should create a job with required properties', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
            };

            const job = createReelJob('job-123', input, defaultDurationRange);

            expect(job.id).toBe('job-123');
            expect(job.status).toBe('pending');
            expect(job.sourceAudioUrl).toBe('https://example.com/audio.ogg');
            expect(job.targetDurationRange).toEqual({ min: 10, max: 90 });
            expect(job.createdAt).toBeInstanceOf(Date);
            expect(job.updatedAt).toBeInstanceOf(Date);
        });

        it('should use custom duration range when provided', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 30, max: 60 },
            };

            const job = createReelJob('job-123', input, defaultDurationRange);

            expect(job.targetDurationRange).toEqual({ min: 30, max: 60 });
        });

        it('should include mood overrides when provided', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
                moodOverrides: ['contemplative', 'slightly edgy'],
            };

            const job = createReelJob('job-123', input, defaultDurationRange);

            expect(job.moodOverrides).toEqual(['contemplative', 'slightly edgy']);
        });

        it('should throw error for empty id', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
            };

            expect(() => createReelJob('', input, defaultDurationRange)).toThrow(
                'ReelJob id cannot be empty'
            );
        });

        it('should throw error for empty sourceAudioUrl', () => {
            const input = { sourceAudioUrl: '' };
            expect(() => createReelJob('job-1', input, defaultDurationRange)).toThrow('ReelJob requires either sourceAudioUrl, transcript, websitePromoInput, or youtubeShortInput');
        });

        it('should throw error for invalid duration range', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 60, max: 30 },
            };

            expect(() => createReelJob('job-123', input, defaultDurationRange)).toThrow(
                'Duration range min cannot be greater than max'
            );
        });

        it('should throw error for non-positive duration values', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 0, max: 30 },
            };

            expect(() => createReelJob('job-123', input, defaultDurationRange)).toThrow(
                'Duration range values must be positive'
            );
        });
    });

    describe('updateJobStatus', () => {
        it('should update status and step', () => {
            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.ogg' },
                defaultDurationRange
            );

            const updated = updateJobStatus(job, 'transcribing', 'Processing audio file');

            expect(updated.status).toBe('transcribing');
            expect(updated.currentStep).toBe('Processing audio file');
            expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(job.updatedAt.getTime());
        });

        it('should preserve other properties', () => {
            const job = createReelJob(
                'job-123',
                {
                    sourceAudioUrl: 'https://example.com/audio.ogg',
                    moodOverrides: ['calm'],
                },
                defaultDurationRange
            );

            const updated = updateJobStatus(job, 'planning');

            expect(updated.id).toBe('job-123');
            expect(updated.sourceAudioUrl).toBe('https://example.com/audio.ogg');
            expect(updated.moodOverrides).toEqual(['calm']);
        });
    });

    describe('failJob', () => {
        it('should set status to failed with error message', () => {
            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.ogg' },
                defaultDurationRange
            );

            const failed = failJob(job, 'TTS service unavailable');

            expect(failed.status).toBe('failed');
            expect(failed.error).toBe('TTS service unavailable');
        });
    });

    describe('completeJob', () => {
        it('should set status to completed with final video URL and manifest', () => {
            const job = createReelJob(
                'job-123',
                { sourceAudioUrl: 'https://example.com/audio.ogg' },
                defaultDurationRange
            );

            const manifest: ReelManifest = {
                durationSeconds: 45,
                segments: [
                    { index: 0, start: 0, end: 15, imageUrl: 'https://example.com/img1.jpg' },
                    { index: 1, start: 15, end: 30, imageUrl: 'https://example.com/img2.jpg' },
                    { index: 2, start: 30, end: 45, imageUrl: 'https://example.com/img3.jpg' },
                ],
                voiceoverUrl: 'https://example.com/voiceover.mp3',
                musicUrl: 'https://example.com/music.mp3',
                subtitlesUrl: 'https://example.com/subs.srt',
            };

            const completed = completeJob(job, 'https://shortstack.com/video.mp4', manifest);

            expect(completed.status).toBe('completed');
            expect(completed.finalVideoUrl).toBe('https://shortstack.com/video.mp4');
            expect(completed.manifest).toEqual(manifest);
            expect(completed.currentStep).toBeUndefined();
        });
    });

    describe('isJobTerminal', () => {
        it('should return true for completed jobs', () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'completed',
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 10, max: 90 },
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(isJobTerminal(job)).toBe(true);
        });

        it('should return true for failed jobs', () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'failed',
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 10, max: 90 },
                error: 'Something went wrong',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(isJobTerminal(job)).toBe(true);
        });

        it('should return false for non-terminal statuses', () => {
            const statuses = [
                'pending',
                'transcribing',
                'planning',
                'generating_commentary',
                'synthesizing_voiceover',
                'selecting_music',
                'generating_images',
                'generating_subtitles',
                'building_manifest',
                'rendering',
                'detecting_intent',
                'generating_animated_video',
            ] as const;

            for (const status of statuses) {
                const job: ReelJob = {
                    id: 'job-123',
                    status,
                    sourceAudioUrl: 'https://example.com/audio.ogg',
                    targetDurationRange: { min: 10, max: 90 },
                    createdAt: new Date(),
                    updatedAt: new Date(),
                };

                expect(isJobTerminal(job)).toBe(false);
            }
        });
    });

    describe('Animated Video Mode Fields', () => {
        it('should allow isAnimatedVideoMode flag on ReelJob', () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'pending',
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 10, max: 90 },
                isAnimatedVideoMode: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(job.isAnimatedVideoMode).toBe(true);
        });

        it('should allow animatedVideoUrl field on ReelJob', () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'completed',
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 10, max: 90 },
                isAnimatedVideoMode: true,
                animatedVideoUrl: 'https://example.com/animated-video.mp4',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            expect(job.animatedVideoUrl).toBe('https://example.com/animated-video.mp4');
        });

        it('should default isAnimatedVideoMode to undefined when not set', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
            };

            const job = createReelJob('job-123', input, defaultDurationRange);

            expect(job.isAnimatedVideoMode).toBeUndefined();
        });

        it('should preserve isAnimatedVideoMode when updating job status', () => {
            const job: ReelJob = {
                id: 'job-123',
                status: 'pending',
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: { min: 10, max: 90 },
                isAnimatedVideoMode: true,
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            const updated = updateJobStatus(job, 'generating_animated_video', 'Creating animated video...');

            expect(updated.isAnimatedVideoMode).toBe(true);
            expect(updated.status).toBe('generating_animated_video');
        });
    });
});
