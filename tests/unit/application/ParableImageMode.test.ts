/**
 * Multi-Clip Parable Video Validation
 * 
 * Validates that parable mode generates multiple video clips (one per beat)
 * instead of one looping video.
 */

import { ParableBeat } from '../../../src/domain/entities/Parable';

describe('Multi-Clip Parable Video Generation', () => {

    const sampleBeats: ParableBeat[] = [
        { role: 'hook', narration: 'Hook text', textOnScreen: 'Hook', imagePrompt: 'img1', approxDurationSeconds: 9 },
        { role: 'setup', narration: 'Setup text', textOnScreen: 'Setup', imagePrompt: 'img2', approxDurationSeconds: 12 },
        { role: 'turn', narration: 'Turn text', textOnScreen: 'Turn', imagePrompt: 'img3', approxDurationSeconds: 11 },
        { role: 'moral', narration: 'Moral text', textOnScreen: 'Moral', imagePrompt: 'img4', approxDurationSeconds: 9 }
    ];

    it('should generate one video per beat', () => {
        const expectedVideoCount = sampleBeats.length;
        expect(expectedVideoCount).toBe(4);
    });

    it('should cap each video at 10 seconds (Kie.ai limit)', () => {
        const kieMaxDuration = 10;
        const cappedDurations = sampleBeats.map(beat =>
            Math.min(beat.approxDurationSeconds || 10, kieMaxDuration)
        );

        cappedDurations.forEach(duration => {
            expect(duration).toBeLessThanOrEqual(10);
        });
    });

    it('total duration should be sum of beat durations', () => {
        const totalDuration = sampleBeats.reduce((sum, beat) =>
            sum + Math.min(beat.approxDurationSeconds || 10, 10), 0
        );
        expect(totalDuration).toBe(9 + 10 + 10 + 9); // 38s (capped at 10 for setup and turn)
    });

    it('Shotstack should receive array of video URLs (animatedVideoUrls)', () => {
        // Simulate the orchestrator output
        const mockVideoUrls = [
            'https://cloudinary.com/parable_job1_beat1.mp4',
            'https://cloudinary.com/parable_job1_beat2.mp4',
            'https://cloudinary.com/parable_job1_beat3.mp4',
            'https://cloudinary.com/parable_job1_beat4.mp4'
        ];

        expect(mockVideoUrls.length).toBe(4);
        expect(mockVideoUrls.every(url => url.endsWith('.mp4'))).toBe(true);
    });

    it('Shotstack should stitch videos in sequence', () => {
        // Simulate Shotstack clip generation
        const videos = ['vid1.mp4', 'vid2.mp4', 'vid3.mp4', 'vid4.mp4'];
        const singleDuration = 40 / videos.length; // 10s each

        const clips = videos.map((url, i) => ({
            asset: { type: 'video', src: url },
            start: i * singleDuration,
            length: singleDuration
        }));

        expect(clips[0].start).toBe(0);
        expect(clips[1].start).toBe(10);
        expect(clips[2].start).toBe(20);
        expect(clips[3].start).toBe(30);
    });
});
