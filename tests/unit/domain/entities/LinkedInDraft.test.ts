
import { assemblePostContent, createLinkedInDraft } from '../../../../src/domain/entities/LinkedInDraft';

describe('LinkedInDraft Entity', () => {
    describe('assemblePostContent', () => {
        it('should format a LinkedIn post with lots of white space and bullets', () => {
            const draft = createLinkedInDraft(
                'test-id',
                { chatId: 123, rawNote: 'test note' },
                {
                    core_tension: 'The tension.',
                    hook: 'The hook.',
                    outline_bullets: ['Insight 1', 'Insight 2', 'Insight 3'],
                    closer_options: ['Question?'],
                    hashtags: ['#tag1', '#tag2']
                }
            );

            const result = assemblePostContent(draft);

            // Check for hook isolation
            expect(result).toMatch(/^The hook\.\n\n\nThe tension\./);

            // Check for bullets
            expect(result).toContain('• Insight 1');
            expect(result).toContain('• Insight 2');
            expect(result).toContain('• Insight 3');

            // Check for extra line breaks between bullets
            expect(result).toContain('• Insight 1\n\n• Insight 2');

            // Check for hashtags at the end
            expect(result).toMatch(/#tag1 #tag2$/);
        });
    });
});
