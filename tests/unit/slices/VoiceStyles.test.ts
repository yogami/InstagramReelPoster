/**
 * VoiceStyles Unit Tests
 * 
 * TDD: Tests written FIRST before implementation
 */

import { resolveVoiceId, VoiceStyle, VOICE_STYLE_MAP } from '../../../src/slices/website-promo/domain/services/VoiceStyles';

describe('VoiceStyles', () => {
    describe('resolveVoiceId', () => {
        it('should return explicit voiceId when provided', () => {
            const explicitId = 'custom-voice-123';
            const result = resolveVoiceId('professional', explicitId);
            expect(result).toBe(explicitId);
        });

        it('should return professional voice ID when style is professional', () => {
            const result = resolveVoiceId('professional');
            expect(result).toBe(VOICE_STYLE_MAP.professional);
        });

        it('should return friendly voice ID when style is friendly', () => {
            const result = resolveVoiceId('friendly');
            expect(result).toBe(VOICE_STYLE_MAP.friendly);
        });

        it('should return energetic voice ID when style is energetic', () => {
            const result = resolveVoiceId('energetic');
            expect(result).toBe(VOICE_STYLE_MAP.energetic);
        });

        it('should return calm voice ID when style is calm', () => {
            const result = resolveVoiceId('calm');
            expect(result).toBe(VOICE_STYLE_MAP.calm);
        });

        it('should default to professional when no style provided', () => {
            const result = resolveVoiceId();
            expect(result).toBe(VOICE_STYLE_MAP.professional);
        });

        it('should prioritize explicit voiceId over style', () => {
            const explicitId = 'override-voice';
            const result = resolveVoiceId('energetic', explicitId);
            expect(result).toBe(explicitId);
        });
    });

    describe('VOICE_STYLE_MAP', () => {
        it('should have all required voice styles', () => {
            const requiredStyles: VoiceStyle[] = ['professional', 'friendly', 'energetic', 'calm'];
            for (const style of requiredStyles) {
                expect(VOICE_STYLE_MAP[style]).toBeDefined();
                expect(typeof VOICE_STYLE_MAP[style]).toBe('string');
            }
        });
    });
});
