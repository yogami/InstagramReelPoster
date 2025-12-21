import {
    ContentMode,
    ForceMode,
    ParableSourceType,
    ParableCulture,
    ParableArchetype,
    ParableIntent,
    ParableSourceChoice,
    ParableBeatRole,
    ParableBeat,
    ParableScriptPlan,
    isParableIntent,
    isParableScriptPlan,
} from '../../../src/domain/entities/Parable';

describe('Parable Domain Entities', () => {
    describe('ContentMode type', () => {
        it('should accept "direct-message" as valid ContentMode', () => {
            const mode: ContentMode = 'direct-message';
            expect(mode).toBe('direct-message');
        });

        it('should accept "parable" as valid ContentMode', () => {
            const mode: ContentMode = 'parable';
            expect(mode).toBe('parable');
        });
    });

    describe('ForceMode type', () => {
        it('should accept "direct" as valid ForceMode', () => {
            const mode: ForceMode = 'direct';
            expect(mode).toBe('direct');
        });

        it('should accept "parable" as valid ForceMode', () => {
            const mode: ForceMode = 'parable';
            expect(mode).toBe('parable');
        });
    });

    describe('ParableCulture type', () => {
        it('should accept all valid cultures', () => {
            const cultures: ParableCulture[] = [
                'indian',
                'chinese',
                'japanese',
                'sufi',
                'western-folklore',
                'generic-eastern'
            ];
            expect(cultures).toHaveLength(6);
        });
    });

    describe('ParableArchetype type', () => {
        it('should accept all valid archetypes', () => {
            const archetypes: ParableArchetype[] = [
                'monk',
                'sage',
                'saint',
                'warrior',
                'king',
                'farmer',
                'villager',
                'student'
            ];
            expect(archetypes).toHaveLength(8);
        });
    });

    describe('ParableIntent', () => {
        it('should create a valid theme-only intent', () => {
            const intent: ParableIntent = {
                sourceType: 'theme-only',
                coreTheme: 'spiritual bypassing',
                moral: 'Avoiding pain through spirituality is still avoidance.'
            };

            expect(intent.sourceType).toBe('theme-only');
            expect(intent.coreTheme).toBe('spiritual bypassing');
            expect(intent.moral).toContain('Avoiding');
        });

        it('should create a valid provided-story intent with cultural preference', () => {
            const intent: ParableIntent = {
                sourceType: 'provided-story',
                coreTheme: 'ego death',
                moral: 'The self you protect is already dead.',
                culturalPreference: 'japanese',
                constraints: ['must involve a samurai', 'set during war']
            };

            expect(intent.sourceType).toBe('provided-story');
            expect(intent.culturalPreference).toBe('japanese');
            expect(intent.constraints).toHaveLength(2);
        });

        it('should validate intent with type guard', () => {
            const validIntent = {
                sourceType: 'theme-only',
                coreTheme: 'gossip',
                moral: 'Gossip is prayer to the ego.'
            };

            const invalidIntent = {
                sourceType: 'theme-only',
                // missing coreTheme and moral
            };

            expect(isParableIntent(validIntent)).toBe(true);
            expect(isParableIntent(invalidIntent)).toBe(false);
            expect(isParableIntent(null)).toBe(false);
            expect(isParableIntent(undefined)).toBe(false);
        });
    });

    describe('ParableSourceChoice', () => {
        it('should create a valid source choice', () => {
            const choice: ParableSourceChoice = {
                culture: 'indian',
                archetype: 'monk',
                rationale: 'Indian monastic tradition best expresses themes of detachment and ego.'
            };

            expect(choice.culture).toBe('indian');
            expect(choice.archetype).toBe('monk');
            expect(choice.rationale).toContain('Indian');
        });
    });

    describe('ParableBeat', () => {
        it('should create valid beats for all roles', () => {
            const roles: ParableBeatRole[] = ['hook', 'setup', 'turn', 'moral'];

            const beats: ParableBeat[] = roles.map((role, index) => ({
                role,
                narration: `Narration for ${role}`,
                textOnScreen: `Text for ${role}`,
                imagePrompt: `2D stylized cartoon of ${role} scene`,
                approxDurationSeconds: 8 + index * 2
            }));

            expect(beats).toHaveLength(4);
            expect(beats[0].role).toBe('hook');
            expect(beats[3].role).toBe('moral');
        });
    });

    describe('ParableScriptPlan', () => {
        it('should create a complete script plan', () => {
            const plan: ParableScriptPlan = {
                mode: 'parable',
                parableIntent: {
                    sourceType: 'theme-only',
                    coreTheme: 'gossip as spiritual avoidance',
                    moral: 'Every word about others is a prayer you refuse to say about yourself.'
                },
                sourceChoice: {
                    culture: 'chinese',
                    archetype: 'monk',
                    rationale: 'Chan Buddhist tradition emphasizes silence and self-inquiry.'
                },
                beats: [
                    {
                        role: 'hook',
                        narration: 'There was a monk whose favorite prayer was gossip.',
                        textOnScreen: 'The Gossiping Monk',
                        imagePrompt: '2D stylized cartoon of elderly Chinese monk whispering to another monk in temple courtyard, muted earth tones, cel-shaded',
                        approxDurationSeconds: 6
                    },
                    {
                        role: 'setup',
                        narration: 'Every morning he would sit in meditation. Every afternoon he would share tales of his brothers\' failures.',
                        textOnScreen: 'Meditation by day. Gossip by night.',
                        imagePrompt: '2D stylized cartoon showing split scene: monk meditating peacefully on left, same monk gossiping animatedly on right, contrasting lighting',
                        approxDurationSeconds: 10
                    },
                    {
                        role: 'turn',
                        narration: 'One day his teacher asked: "What do you see when you speak of others?" The monk fell silent.',
                        textOnScreen: '"What do you see?"',
                        imagePrompt: '2D stylized cartoon of serious elderly teacher confronting younger monk, dramatic lighting from window, tension in composition',
                        approxDurationSeconds: 8
                    },
                    {
                        role: 'moral',
                        narration: 'Every word about someone else is a mirror you refuse to look into.',
                        textOnScreen: 'Every word is a mirror.',
                        imagePrompt: '2D stylized cartoon of monk looking at his reflection in still water, but reflection shows shadowy figure, introspective mood',
                        approxDurationSeconds: 6
                    }
                ]
            };

            expect(plan.mode).toBe('parable');
            expect(plan.beats).toHaveLength(4);
            expect(plan.beats.map((b: ParableBeat) => b.role)).toEqual(['hook', 'setup', 'turn', 'moral']);

            const totalDuration = plan.beats.reduce((sum: number, b: ParableBeat) => sum + b.approxDurationSeconds, 0);
            expect(totalDuration).toBe(30);
        });

        it('should validate script plan with type guard', () => {
            const validPlan = {
                mode: 'parable',
                parableIntent: {
                    sourceType: 'theme-only',
                    coreTheme: 'test',
                    moral: 'test moral'
                },
                sourceChoice: {
                    culture: 'indian',
                    archetype: 'sage',
                    rationale: 'test'
                },
                beats: [
                    { role: 'hook', narration: 'test', textOnScreen: 'test', imagePrompt: 'test', approxDurationSeconds: 5 }
                ]
            };

            const invalidPlan = {
                mode: 'parable',
                // missing required fields
            };

            expect(isParableScriptPlan(validPlan)).toBe(true);
            expect(isParableScriptPlan(invalidPlan)).toBe(false);
            expect(isParableScriptPlan(null)).toBe(false);
        });
    });
});
