import axios from 'axios';
import nock from 'nock';
import { OpenAILLMClient } from '../../../src/infrastructure/llm/OpenAILLMClient';
import { ParableIntent, ParableSourceChoice, ParableBeat } from '../../../src/domain/entities/Parable';

describe('OpenAILLMClient Parable Methods', () => {
    const apiKey = 'test-api-key';
    const model = 'gpt-4o';
    let client: OpenAILLMClient;

    beforeEach(() => {
        client = new OpenAILLMClient(apiKey, model);
        if (!nock.isActive()) nock.activate();
    });

    afterEach(() => {
        nock.cleanAll();
        nock.restore();
    });

    describe('detectContentMode', () => {
        it('should detect parable mode when transcript mentions story keywords', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            contentMode: 'parable',
                            reason: 'Transcript mentions "monk" and "tale"'
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const result = await client.detectContentMode!(
                'I want to tell a story about a monk who learned the value of silence'
            );

            expect(result.contentMode).toBe('parable');
            expect(result.reason).toContain('monk');
        });

        it('should detect direct-message mode for commentary transcripts', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            contentMode: 'direct-message',
                            reason: 'Direct commentary about mindfulness'
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const result = await client.detectContentMode!(
                'I want to talk about how mindfulness is overrated'
            );

            expect(result.contentMode).toBe('direct-message');
        });

        it('should default to direct-message on parsing failure', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'invalid json response'
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const result = await client.detectContentMode!('some transcript');

            expect(result.contentMode).toBe('direct-message');
            expect(result.reason).toContain('failed');
        });
    });

    describe('extractParableIntent', () => {
        it('should extract theme-only intent from abstract transcript', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            sourceType: 'theme-only',
                            coreTheme: 'spiritual gossip',
                            moral: 'Gossip is prayer to the ego'
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const result = await client.extractParableIntent!(
                'I think people gossip because they are avoiding their own shadow'
            );

            expect(result.sourceType).toBe('theme-only');
            expect(result.coreTheme).toBe('spiritual gossip');
            expect(result.moral).toContain('ego');
        });

        it('should extract provided-story intent with constraints', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            sourceType: 'provided-story',
                            coreTheme: 'ego death',
                            moral: 'The self you protect is already dead',
                            culturalPreference: 'japanese',
                            constraints: ['samurai warrior', 'before battle']
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const result = await client.extractParableIntent!(
                'Tell the story of a samurai before his final battle who realizes ego is an illusion'
            );

            expect(result.sourceType).toBe('provided-story');
            expect(result.culturalPreference).toBe('japanese');
            expect(result.constraints).toContain('samurai warrior');
        });
    });

    describe('chooseParableSource', () => {
        it('should choose culture and archetype based on intent', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            culture: 'chinese',
                            archetype: 'monk',
                            rationale: 'Chan Buddhist tradition emphasizes silence'
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const intent: ParableIntent = {
                sourceType: 'theme-only',
                coreTheme: 'silence vs noise',
                moral: 'Silence is the loudest teacher'
            };

            const result = await client.chooseParableSource!(intent);

            expect(result.culture).toBe('chinese');
            expect(result.archetype).toBe('monk');
            expect(result.rationale).toContain('Chan');
        });

        it('should respect cultural preference when provided', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            culture: 'sufi',
                            archetype: 'sage',
                            rationale: 'Sufi tradition matches the theme of divine love'
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const intent: ParableIntent = {
                sourceType: 'theme-only',
                coreTheme: 'divine love',
                moral: 'The beloved is always within',
                culturalPreference: 'sufi'
            };

            const result = await client.chooseParableSource!(intent);

            expect(result.culture).toBe('sufi');
        });
    });

    describe('generateParableScript', () => {
        it('should generate 4-beat parable script', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            mode: 'parable',
                            parableIntent: {
                                sourceType: 'theme-only',
                                coreTheme: 'gossip',
                                moral: 'Every word about others is a prayer to the ego'
                            },
                            sourceChoice: {
                                culture: 'chinese',
                                archetype: 'monk',
                                rationale: 'Chan tradition'
                            },
                            beats: [
                                {
                                    role: 'hook',
                                    narration: 'There was a monk whose favorite prayer was gossip.',
                                    textOnScreen: 'The Gossiping Monk',
                                    imagePrompt: '2D cartoon of monk whispering',
                                    approxDurationSeconds: 6
                                },
                                {
                                    role: 'setup',
                                    narration: 'Every morning he meditated. Every afternoon he shared tales.',
                                    textOnScreen: 'Meditation by day. Gossip by night.',
                                    imagePrompt: '2D cartoon split scene',
                                    approxDurationSeconds: 10
                                },
                                {
                                    role: 'turn',
                                    narration: 'His teacher asked: What do you see when you speak of others?',
                                    textOnScreen: 'What do you see?',
                                    imagePrompt: '2D cartoon of confrontation',
                                    approxDurationSeconds: 8
                                },
                                {
                                    role: 'moral',
                                    narration: 'Every word about someone else is a mirror you refuse to look into.',
                                    textOnScreen: 'Every word is a mirror.',
                                    imagePrompt: '2D cartoon of reflection',
                                    approxDurationSeconds: 6
                                }
                            ]
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const intent: ParableIntent = {
                sourceType: 'theme-only',
                coreTheme: 'gossip',
                moral: 'Gossip is avoidance'
            };

            const sourceChoice: ParableSourceChoice = {
                culture: 'chinese',
                archetype: 'monk',
                rationale: 'Chan tradition'
            };

            const result = await client.generateParableScript!(intent, sourceChoice, 30);

            expect(result.mode).toBe('parable');
            expect(result.beats).toHaveLength(4);
            expect(result.beats.map((b: ParableBeat) => b.role)).toEqual(['hook', 'setup', 'turn', 'moral']);

            const totalDuration = result.beats.reduce((sum: number, b: ParableBeat) => sum + b.approxDurationSeconds, 0);
            expect(totalDuration).toBe(30);
        });
    });

    describe('generateParableHooks', () => {
        it('should generate character-tension based hooks', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            hooks: [
                                'The monk who loved gossip more than silence.',
                                'His prayers were whispers about others.',
                                'Meditation by day. Judgment by night.',
                                'The holiest man in the temple had the sharpest tongue.',
                                'He could sit in stillness for hours. But his words never rested.'
                            ]
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const parableScript = {
                mode: 'parable' as const,
                parableIntent: {
                    sourceType: 'theme-only' as const,
                    coreTheme: 'gossip',
                    moral: 'test'
                },
                sourceChoice: {
                    culture: 'chinese' as const,
                    archetype: 'monk' as const,
                    rationale: 'test'
                },
                beats: []
            };

            const result = await client.generateParableHooks!(parableScript);

            expect(result).toHaveLength(5);
            expect(result[0]).toContain('monk');
        });
    });

    describe('generateParableCaptionAndTags', () => {
        it('should generate parable-optimized caption and hashtags', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: JSON.stringify({
                            captionBody: 'A monk who meditated by morning and gossiped by night.\n\nSound familiar?\n\nSave this for the next time you catch yourself talking about others.',
                            hashtags: [
                                '#spiritualstorytelling',
                                '#parables',
                                '#shadowwork',
                                '#ChallengingView',
                                '#spirituality',
                                '#reels',
                                '#mindfulness',
                                '#selfinquiry',
                                '#psychology',
                                '#growth'
                            ]
                        })
                    }
                }]
            };

            nock('https://api.openai.com')
                .post('/v1/chat/completions')
                .reply(200, mockResponse);

            const parableScript = {
                mode: 'parable' as const,
                parableIntent: {
                    sourceType: 'theme-only' as const,
                    coreTheme: 'gossip',
                    moral: 'Every word about others is a prayer to the ego'
                },
                sourceChoice: {
                    culture: 'chinese' as const,
                    archetype: 'monk' as const,
                    rationale: 'test'
                },
                beats: []
            };

            const result = await client.generateParableCaptionAndTags!(parableScript, 'A gossiping monk');

            expect(result.captionBody).toContain('Save this');
            expect(result.hashtags).toContain('#parables');
            expect(result.hashtags).toContain('#ChallengingView');
            expect(result.hashtags.length).toBeGreaterThanOrEqual(8);
        });
    });
});
