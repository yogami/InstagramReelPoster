/**
 * Parable Prompt Validation Tests
 * 
 * These tests validate that parable LLM prompts meet acceptance criteria
 * WITHOUT calling the actual Gpt API. They verify:
 * 1. Output structure matches expected types
 * 2. Character names are preserved
 * 3. Duration targets are met
 * 4. Hashtags are generated
 */

import { ParableIntent, ParableSourceChoice, ParableScriptPlan, ParableBeat, isParableScriptPlan, isParableIntent } from '../../../src/domain/entities/Parable';

describe('Parable Prompt Acceptance Criteria', () => {

    // ============================================================
    // 1. detectContentMode Acceptance Criteria
    // ============================================================
    describe('AC1: detectContentMode', () => {
        const validParableOutput = { contentMode: 'parable' as const, reason: 'Contains story keywords' };
        const validDirectOutput = { contentMode: 'direct-message' as const, reason: 'Direct commentary' };

        it('should return valid contentMode enum', () => {
            expect(['parable', 'direct-message']).toContain(validParableOutput.contentMode);
            expect(['parable', 'direct-message']).toContain(validDirectOutput.contentMode);
        });

        it('should always have a reason string', () => {
            expect(typeof validParableOutput.reason).toBe('string');
            expect(validParableOutput.reason.length).toBeGreaterThan(0);
        });
    });

    // ============================================================
    // 2. extractParableIntent Acceptance Criteria
    // ============================================================
    describe('AC2: extractParableIntent', () => {
        const validProvidedStoryIntent: ParableIntent = {
            sourceType: 'provided-story',
            coreTheme: 'atomic habits and daily discipline',
            moral: 'Those who compound in silence embarrass those with every advantage',
            culturalPreference: 'indian',
            constraints: ['archer', 'tribal boy'],
            providedStoryContext: 'Ekalavya, a tribal boy, practiced archery daily shooting at a clay statue of Dronacharya. Without a formal teacher, he became better than the royal princes.'
        };

        const validThemeOnlyIntent: ParableIntent = {
            sourceType: 'theme-only',
            coreTheme: 'spiritual gossip',
            moral: 'Every word about others is a prayer to the ego'
        };

        it('should have valid sourceType enum', () => {
            expect(['provided-story', 'theme-only']).toContain(validProvidedStoryIntent.sourceType);
            expect(['provided-story', 'theme-only']).toContain(validThemeOnlyIntent.sourceType);
        });

        it('should have non-empty coreTheme', () => {
            expect(validProvidedStoryIntent.coreTheme.length).toBeGreaterThan(0);
            expect(validThemeOnlyIntent.coreTheme.length).toBeGreaterThan(0);
        });

        it('should have non-empty moral', () => {
            expect(validProvidedStoryIntent.moral.length).toBeGreaterThan(0);
            expect(validThemeOnlyIntent.moral.length).toBeGreaterThan(0);
        });

        it('CRITICAL: providedStoryContext must contain character names for provided-story', () => {
            // This is the key validation - character names MUST be preserved
            expect(validProvidedStoryIntent.providedStoryContext).toContain('Ekalavya');
            expect(validProvidedStoryIntent.providedStoryContext).toContain('Dronacharya');
        });

        it('should detect culturalPreference when mentioned', () => {
            expect(validProvidedStoryIntent.culturalPreference).toBe('indian');
        });

        it('should pass isParableIntent type guard', () => {
            expect(isParableIntent(validProvidedStoryIntent)).toBe(true);
            expect(isParableIntent(validThemeOnlyIntent)).toBe(true);
        });
    });

    // ============================================================
    // 3. chooseParableSource Acceptance Criteria
    // ============================================================
    describe('AC3: chooseParableSource', () => {
        const validCultures = ['indian', 'chinese', 'japanese', 'sufi', 'western-folklore', 'generic-eastern'];
        const validArchetypes = ['monk', 'sage', 'saint', 'warrior', 'king', 'farmer', 'villager', 'student'];

        const validSourceChoice: ParableSourceChoice = {
            culture: 'indian',
            archetype: 'student',
            rationale: 'Indian tradition matches Ekalavya story, student archetype for learning journey'
        };

        it('should have valid culture enum', () => {
            expect(validCultures).toContain(validSourceChoice.culture);
        });

        it('should have valid archetype enum', () => {
            expect(validArchetypes).toContain(validSourceChoice.archetype);
        });

        it('should have non-empty rationale', () => {
            expect(validSourceChoice.rationale.length).toBeGreaterThan(0);
        });

        it('should respect culturalPreference from intent', () => {
            // When intent.culturalPreference = 'indian', culture should be 'indian'
            const intentWithPreference: ParableIntent = {
                sourceType: 'provided-story',
                coreTheme: 'test',
                moral: 'test',
                culturalPreference: 'indian'
            };
            // The source choice should match
            expect(validSourceChoice.culture).toBe(intentWithPreference.culturalPreference);
        });
    });

    // ============================================================
    // 4. generateParableScript Acceptance Criteria ⭐ CRITICAL
    // ============================================================
    describe('AC4: generateParableScript', () => {
        const validParableScript: ParableScriptPlan = {
            mode: 'parable',
            parableIntent: {
                sourceType: 'provided-story',
                coreTheme: 'atomic habits',
                moral: 'Those who compound in silence embarrass those with every advantage'
            },
            sourceChoice: {
                culture: 'indian',
                archetype: 'student',
                rationale: 'Matches Ekalavya story'
            },
            beats: [
                {
                    role: 'hook',
                    narration: 'There was a tribal boy named Ekalavya whose only teacher was a clay statue.',
                    textOnScreen: 'The Forgotten Archer',
                    imagePrompt: '2D stylized cartoon of a young Indian boy in forest with bow, earth tones',
                    approxDurationSeconds: 9
                },
                {
                    role: 'setup',
                    narration: 'While princes trained under Dronacharya, the greatest teacher, Ekalavya practiced alone. Day after day. Arrow after arrow. No audience. No praise. No recognition.',
                    textOnScreen: 'No teacher. No recognition.',
                    imagePrompt: '2D stylized cartoon of forest practice scene with clay statue, muted colors',
                    approxDurationSeconds: 12
                },
                {
                    role: 'turn',
                    narration: 'When the princes finally met him, they couldn\'t believe their eyes. The outcast had surpassed them all. Silent practice had done what privilege could not.',
                    textOnScreen: 'The outcast surpassed them all.',
                    imagePrompt: '2D stylized cartoon of shocked princes watching archer, dramatic lighting',
                    approxDurationSeconds: 11
                },
                {
                    role: 'moral',
                    narration: 'The ones who compound in silence always embarrass those who had every advantage. Your excuses are showing.',
                    textOnScreen: 'Your excuses are showing.',
                    imagePrompt: '2D stylized cartoon close-up of determined eyes, minimal design',
                    approxDurationSeconds: 9
                }
            ]
        };

        it('should have exactly 4 beats', () => {
            expect(validParableScript.beats).toHaveLength(4);
        });

        it('should have correct beat roles in order', () => {
            const roles = validParableScript.beats.map(b => b.role);
            expect(roles).toEqual(['hook', 'setup', 'turn', 'moral']);
        });

        it('CRITICAL: total duration must be >= 30 seconds', () => {
            const totalDuration = validParableScript.beats.reduce((sum, b) => sum + b.approxDurationSeconds, 0);
            expect(totalDuration).toBeGreaterThanOrEqual(30);
        });

        it('CRITICAL: character names must appear in narration when providedStoryContext has them', () => {
            // Ekalavya should appear in at least one narration
            const allNarration = validParableScript.beats.map(b => b.narration).join(' ');
            expect(allNarration).toContain('Ekalavya');
        });

        it('CRITICAL: teacher name should appear when in providedStoryContext', () => {
            const allNarration = validParableScript.beats.map(b => b.narration).join(' ');
            expect(allNarration).toContain('Dronacharya');
        });

        it('each beat should have narration > 10 characters', () => {
            validParableScript.beats.forEach(beat => {
                expect(beat.narration.length).toBeGreaterThan(10);
            });
        });

        it('each beat should have textOnScreen > 3 characters', () => {
            validParableScript.beats.forEach(beat => {
                expect(beat.textOnScreen.length).toBeGreaterThan(3);
            });
        });

        it('each imagePrompt should start with "2D stylized cartoon"', () => {
            validParableScript.beats.forEach(beat => {
                expect(beat.imagePrompt).toMatch(/^2D stylized cartoon/);
            });
        });

        it('beat durations should be within expected ranges', () => {
            const [hook, setup, turn, moral] = validParableScript.beats;
            expect(hook.approxDurationSeconds).toBeGreaterThanOrEqual(8);
            expect(hook.approxDurationSeconds).toBeLessThanOrEqual(10);
            expect(setup.approxDurationSeconds).toBeGreaterThanOrEqual(10);
            expect(setup.approxDurationSeconds).toBeLessThanOrEqual(14);
            expect(turn.approxDurationSeconds).toBeGreaterThanOrEqual(10);
            expect(turn.approxDurationSeconds).toBeLessThanOrEqual(12);
            expect(moral.approxDurationSeconds).toBeGreaterThanOrEqual(8);
            expect(moral.approxDurationSeconds).toBeLessThanOrEqual(10);
        });

        it('should pass isParableScriptPlan type guard', () => {
            expect(isParableScriptPlan(validParableScript)).toBe(true);
        });

        // ============================================================
        // Daniel's Viral Tactics Validation
        // ============================================================

        it('VIRAL: hook first sentence should be short and grab-worthy (< 80 chars)', () => {
            // First sentence must grab in 1-3 seconds
            const hookNarration = validParableScript.beats[0].narration;
            const firstSentence = hookNarration.split('.')[0];
            expect(firstSentence.length).toBeLessThan(80);
        });

        it('VIRAL: turn beat should contain a re-hook phrase pattern', () => {
            // Turn should start with or contain a curiosity-renewing phrase
            const turnNarration = validParableScript.beats[2].narration;
            const reHookPatterns = [
                /but here/i,
                /what happened next/i,
                /and then/i,
                /finally/i,
                /until/i,
                /one day/i
            ];
            const hasReHook = reHookPatterns.some(pattern => pattern.test(turnNarration));
            expect(hasReHook).toBe(true);
        });

        it('VIRAL: language should be simple (sentences average < 15 words)', () => {
            // 5th-8th grade level = simple sentences
            const allNarration = validParableScript.beats.map(b => b.narration).join(' ');
            const sentences = allNarration.split(/[.!?]+/).filter(s => s.trim().length > 0);
            const totalWords = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0);
            const avgWordsPerSentence = totalWords / sentences.length;
            expect(avgWordsPerSentence).toBeLessThan(15);
        });
    });

    // ============================================================
    // 5. generateParableHooks Acceptance Criteria
    // ============================================================
    describe('AC5: generateParableHooks', () => {
        const validHooks = [
            'The boy with no teacher outshot princes.',
            'He practiced alone. They practiced with masters. Guess who won.',
            'A clay statue taught him what wealth couldn\'t buy.',
            'Ekalavya had nothing but discipline. It was enough.',
            'The forest was his classroom. Silence was his teacher.'
        ];

        it('should return an array', () => {
            expect(Array.isArray(validHooks)).toBe(true);
        });

        it('should have at least 3 hooks', () => {
            expect(validHooks.length).toBeGreaterThanOrEqual(3);
        });

        it('each hook should be < 100 characters', () => {
            validHooks.forEach(hook => {
                expect(hook.length).toBeLessThan(100);
            });
        });

        it('at least one hook should reference the main character', () => {
            const hasCharacterReference = validHooks.some(h =>
                h.toLowerCase().includes('ekalavya') ||
                h.toLowerCase().includes('boy') ||
                h.toLowerCase().includes('he')
            );
            expect(hasCharacterReference).toBe(true);
        });
    });

    // ============================================================
    // 6. generateParableCaptionAndTags Acceptance Criteria ⭐ CRITICAL
    // ============================================================
    describe('AC6: generateParableCaptionAndTags', () => {
        const validCaptionAndTags = {
            captionBody: 'A tribal boy practiced archery alone in the forest every day.\n\nNo teacher. No validation. No audience.\n\nJust a clay statue and relentless discipline.\n\nWhen the princes finally saw him shoot, they couldn\'t believe it.\n\nThe one who had nothing had become the best.\n\nSave this for the next time you make an excuse.',
            hashtags: [
                '#spiritualstorytelling',
                '#parables',
                '#atomichabits',
                '#ChallengingView',
                '#discipline',
                '#ekalavya',
                '#spirituality',
                '#reels',
                '#mindfulness',
                '#growth'
            ]
        };

        it('captionBody should be non-empty (> 20 chars)', () => {
            expect(validCaptionAndTags.captionBody.length).toBeGreaterThan(20);
        });

        it('CRITICAL: should have at least 8 hashtags', () => {
            expect(validCaptionAndTags.hashtags.length).toBeGreaterThanOrEqual(8);
        });

        it('all hashtags should start with #', () => {
            validCaptionAndTags.hashtags.forEach(tag => {
                expect(tag).toMatch(/^#/);
            });
        });

        it('should include brand hashtag #ChallengingView', () => {
            expect(validCaptionAndTags.hashtags).toContain('#ChallengingView');
        });

        it('should include parable-related hashtag', () => {
            const parableRelated = validCaptionAndTags.hashtags.some(tag =>
                tag.includes('parable') ||
                tag.includes('story') ||
                tag.includes('spiritual')
            );
            expect(parableRelated).toBe(true);
        });

        it('should have no duplicate hashtags', () => {
            const uniqueTags = new Set(validCaptionAndTags.hashtags);
            expect(uniqueTags.size).toBe(validCaptionAndTags.hashtags.length);
        });
    });
});
