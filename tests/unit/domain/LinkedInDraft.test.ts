/**
 * LinkedInDraft Entity Tests
 * 
 * AC1: LinkedIn Detection
 * AC2: LinkedInDraft Entity Creation
 */

import {
    LinkedInDraft,
    LinkedInDraftInput,
    LinkedInDraftContent,
    createLinkedInDraft,
    isLinkedInRequest,
    extractRawNote,
} from '../../../src/domain/entities/LinkedInDraft';

describe('LinkedInDraft Entity', () => {
    // =====================================================
    // AC1: LinkedIn Detection
    // =====================================================
    describe('AC1: LinkedIn Detection', () => {
        it('should detect "linkedin" keyword (lowercase)', () => {
            expect(isLinkedInRequest('linkedin post about founders')).toBe(true);
        });

        it('should detect "LinkedIn" keyword (proper case)', () => {
            expect(isLinkedInRequest('LinkedIn post about psychology')).toBe(true);
        });

        it('should detect "LINKEDIN" keyword (uppercase)', () => {
            expect(isLinkedInRequest('LINKEDIN post about spirituality')).toBe(true);
        });

        it('should detect linkedin in the middle of text', () => {
            expect(isLinkedInRequest('I want to write a linkedin post about work')).toBe(true);
        });

        it('should NOT detect similar words', () => {
            expect(isLinkedInRequest('linkedinprofile')).toBe(false); // No word boundary
            expect(isLinkedInRequest('mylinkedin')).toBe(false);
        });

        it('should NOT detect unrelated text', () => {
            expect(isLinkedInRequest('Create a reel about motivation')).toBe(false);
        });
    });

    // =====================================================
    // AC1: Raw Note Extraction
    // =====================================================
    describe('AC1: Raw Note Extraction', () => {
        it('should remove "linkedin" keyword and trim', () => {
            const result = extractRawNote('linkedin Most founders confuse hustle with progress');
            expect(result).toBe('Most founders confuse hustle with progress');
        });

        it('should handle linkedin in the middle', () => {
            const result = extractRawNote('Post on linkedin about burnout culture');
            expect(result).toBe('Post on  about burnout culture');
        });

        it('should handle mixed case', () => {
            const result = extractRawNote('LinkedIn The spiritual bypass in startup culture');
            expect(result).toBe('The spiritual bypass in startup culture');
        });
    });

    // =====================================================
    // AC2: LinkedInDraft Creation
    // =====================================================
    describe('AC2: LinkedInDraft Creation', () => {
        const validInput: LinkedInDraftInput = {
            chatId: 12345,
            rawNote: 'Most founders confuse hustle with progress',
        };

        const validContent: LinkedInDraftContent = {
            core_tension: 'The culture glorifies busyness over clarity.',
            hook: 'You are not productive. You are just moving fast.',
            outline_bullets: [
                'Speed without direction is just chaos',
                'Real progress is measured in decisions, not hours',
                'The most effective founders do less, not more',
            ],
            closer_options: [
                'When was the last time you stopped to ask why?',
                'Stillness is not laziness. It is strategy.',
            ],
        };

        it('should create a valid LinkedInDraft', () => {
            const draft = createLinkedInDraft('draft_001', validInput, validContent);

            expect(draft.id).toBe('draft_001');
            expect(draft.chatId).toBe(12345);
            expect(draft.rawNote).toBe('Most founders confuse hustle with progress');
            expect(draft.coreTension).toBe('The culture glorifies busyness over clarity.');
            expect(draft.hook).toBe('You are not productive. You are just moving fast.');
            expect(draft.outlineBullets).toHaveLength(3);
            expect(draft.closerOptions).toHaveLength(2);
            expect(draft.status).toBe('draft');
            expect(draft.createdAt).toBeInstanceOf(Date);
        });

        it('should reject empty id', () => {
            expect(() => createLinkedInDraft('', validInput, validContent))
                .toThrow('LinkedInDraft id cannot be empty');
        });

        it('should reject empty rawNote', () => {
            const emptyInput = { ...validInput, rawNote: '   ' };
            expect(() => createLinkedInDraft('draft_002', emptyInput, validContent))
                .toThrow('LinkedInDraft rawNote cannot be empty');
        });

        it('should reject empty hook', () => {
            const emptyHook = { ...validContent, hook: '' };
            expect(() => createLinkedInDraft('draft_003', validInput, emptyHook))
                .toThrow('LinkedInDraft hook cannot be empty');
        });

        it('should reject fewer than 3 outline bullets', () => {
            const fewBullets = { ...validContent, outline_bullets: ['One', 'Two'] };
            expect(() => createLinkedInDraft('draft_004', validInput, fewBullets))
                .toThrow('LinkedInDraft must have at least 3 outline bullets');
        });

        it('should trim whitespace from all fields', () => {
            const paddedContent: LinkedInDraftContent = {
                core_tension: '  Tension with spaces  ',
                hook: '  Hook with spaces  ',
                outline_bullets: ['  Bullet 1  ', '  Bullet 2  ', '  Bullet 3  '],
                closer_options: ['  Closer 1  '],
            };
            const draft = createLinkedInDraft('draft_005', validInput, paddedContent);

            expect(draft.coreTension).toBe('Tension with spaces');
            expect(draft.hook).toBe('Hook with spaces');
            expect(draft.outlineBullets[0]).toBe('Bullet 1');
            expect(draft.closerOptions[0]).toBe('Closer 1');
        });
    });
});
