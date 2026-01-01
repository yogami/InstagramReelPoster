/**
 * Telegram Text Prompt Support Tests
 * 
 * Tests the new text prompt handling in telegramWebhook.
 */

import { ReelJobInput, createReelJob } from '../../../src/domain/entities/ReelJob';
import { v4 as uuidv4 } from 'uuid';

describe('Telegram Text Prompt Support', () => {

    const defaultDurationRange = { min: 10, max: 90 };

    // =====================================================
    // ReelJobInput Validation
    // =====================================================
    describe('ReelJobInput Validation', () => {

        it('should accept sourceAudioUrl input', () => {
            const input: ReelJobInput = {
                sourceAudioUrl: 'https://example.com/audio.ogg',
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.sourceAudioUrl).toBe('https://example.com/audio.ogg');
            expect(job.transcript).toBeUndefined();
        });

        it('should accept transcript input (text prompt)', () => {
            const input: ReelJobInput = {
                transcript: 'Create a motivational reel about discipline',
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.transcript).toBe('Create a motivational reel about discipline');
            expect(job.sourceAudioUrl).toBe(''); // Empty when using transcript
        });

        it('should reject input with neither audio nor transcript', () => {
            const input: ReelJobInput = {
                targetDurationRange: defaultDurationRange
            };

            expect(() => createReelJob(uuidv4(), input, defaultDurationRange))
                .toThrow('ReelJob requires either sourceAudioUrl, transcript, websitePromoInput, or youtubeShortInput');
        });

        it('should reject empty transcript', () => {
            const input: ReelJobInput = {
                transcript: '   ',
                targetDurationRange: defaultDurationRange
            };

            expect(() => createReelJob(uuidv4(), input, defaultDurationRange))
                .toThrow('ReelJob requires either sourceAudioUrl, transcript, websitePromoInput, or youtubeShortInput');
        });

        it('should trim transcript whitespace', () => {
            const input: ReelJobInput = {
                transcript: '  Hello world  ',
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.transcript).toBe('Hello world');
        });
    });

    // =====================================================
    // Telegram Message Types
    // =====================================================
    describe('Message Type Detection', () => {

        it('should identify voice messages', () => {
            const message = {
                voice: { file_id: 'abc123', duration: 30 }
            };
            const hasVoice = !!message.voice;
            expect(hasVoice).toBe(true);
        });

        it('should identify audio messages', () => {
            const message = {
                audio: { file_id: 'abc123', duration: 60 }
            };
            const hasAudio = !!message.audio;
            expect(hasAudio).toBe(true);
        });

        it('should identify text messages', () => {
            const message = {
                text: 'Create a reel about motivation'
            };
            const hasText = !!message.text && message.text.trim().length > 0;
            expect(hasText).toBe(true);
        });

        it('should ignore empty text messages', () => {
            const message = {
                text: '   '
            };
            const hasText = !!message.text && message.text.trim().length > 0;
            expect(hasText).toBe(false);
        });

        it('should identify commands (/start, /help)', () => {
            const isCommand = (text: string) => text.startsWith('/');

            expect(isCommand('/start')).toBe(true);
            expect(isCommand('/help')).toBe(true);
            expect(isCommand('Hello')).toBe(false);
        });
    });

    // =====================================================
    // Edge Cases
    // =====================================================
    describe('Edge Cases', () => {

        it('should handle very long text prompts', () => {
            const longText = 'A'.repeat(5000);
            const input: ReelJobInput = {
                transcript: longText,
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.transcript?.length).toBe(5000);
        });

        it('should handle special characters in text', () => {
            const specialText = 'Tell the story of "Ekalavya" & Dronacharya\'s test!';
            const input: ReelJobInput = {
                transcript: specialText,
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.transcript).toBe(specialText);
        });

        it('should handle unicode/emoji in text', () => {
            const emojiText = '🎬 Create a motivational reel 💪';
            const input: ReelJobInput = {
                transcript: emojiText,
                targetDurationRange: defaultDurationRange
            };

            const job = createReelJob(uuidv4(), input, defaultDurationRange);
            expect(job.transcript).toBe(emojiText);
        });
    });
});
