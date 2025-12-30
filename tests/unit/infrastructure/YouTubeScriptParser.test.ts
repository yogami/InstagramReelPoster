import { YouTubeScriptParser } from '../../../src/infrastructure/youtube/YouTubeScriptParser';

describe('YouTubeScriptParser', () => {
    const VALID_SCRIPT = `Youtube Short Script: The Geological Birth of India
Total Runtime: 60 Seconds | Tone: Epic & Fast-Paced

[0:00–0:10] The Collision
Visual: A high-speed CGI animation of the Indian plate racing across the ocean and slamming into Asia.
Narrator: India wasn't always where it is today. 100 million years ago, it was an island spearhead breaking away from the South Pole.

[0:10–0:25] The Deccan Fire
Visual: Glowing red cracks opening in the earth; vast floods of black lava.
Narrator: On its journey, India crossed a volcanic hotspot. For a million years, the earth bled lava.

[0:25–0:45] The Roof of the World
Visual: The Tethys Sea floor crumpling upward into the peaks of the Himalayas.
Narrator: Then came the Great Collision. As India smashed into Asia, the ancient Tethys Ocean was squeezed upward.

[0:45–1:00] The Climate Engine
Visual: Satellite view of monsoon clouds swirling toward the Himalayas.
Narrator: This wall of stone trapped the winds, creating the Monsoon.`;

    describe('isYouTubeRequest', () => {
        it('should return true for valid YouTube script header', () => {
            expect(YouTubeScriptParser.isYouTubeRequest('Youtube Short Script: Test')).toBe(true);
            expect(YouTubeScriptParser.isYouTubeRequest('youtube short script: Test')).toBe(true);
            expect(YouTubeScriptParser.isYouTubeRequest('  Youtube Short Script: Test  ')).toBe(true);
        });

        it('should return false for non-YouTube content', () => {
            expect(YouTubeScriptParser.isYouTubeRequest('Hello world')).toBe(false);
            expect(YouTubeScriptParser.isYouTubeRequest('linkedin my thoughts')).toBe(false);
        });
    });

    describe('parse', () => {
        it('should parse a valid YouTube script', () => {
            const result = YouTubeScriptParser.parse(VALID_SCRIPT);

            expect(result.title).toBe('The Geological Birth of India');
            expect(result.totalDurationSeconds).toBe(60);
            expect(result.tone).toBe('Epic & Fast-Paced');
            expect(result.scenes).toHaveLength(4);
        });

        it('should extract scene details correctly', () => {
            const result = YouTubeScriptParser.parse(VALID_SCRIPT);
            const firstScene = result.scenes[0];

            expect(firstScene.startTime).toBe('0:00');
            expect(firstScene.endTime).toBe('0:10');
            expect(firstScene.title).toBe('The Collision');
            expect(firstScene.visualPrompt).toContain('CGI animation');
            expect(firstScene.narration).toContain('India wasn\'t always');
            expect(firstScene.durationSeconds).toBe(10);
        });

        it('should calculate scene durations correctly', () => {
            const result = YouTubeScriptParser.parse(VALID_SCRIPT);

            expect(result.scenes[0].durationSeconds).toBe(10);  // 0:00 - 0:10
            expect(result.scenes[1].durationSeconds).toBe(15);  // 0:10 - 0:25
            expect(result.scenes[2].durationSeconds).toBe(20);  // 0:25 - 0:45
            expect(result.scenes[3].durationSeconds).toBe(15);  // 0:45 - 1:00
        });

        it('should throw on missing header', () => {
            expect(() => YouTubeScriptParser.parse('Some random text')).toThrow('missing "Youtube Short Script: [Title]" header');
        });

        it('should throw on missing runtime', () => {
            const badScript = 'Youtube Short Script: Test\nNo runtime here';
            expect(() => YouTubeScriptParser.parse(badScript)).toThrow('missing "Total Runtime: N Seconds"');
        });

        it('should throw on no valid scenes', () => {
            const badScript = 'Youtube Short Script: Test\nTotal Runtime: 60 Seconds\nNo scenes here';
            expect(() => YouTubeScriptParser.parse(badScript)).toThrow('no valid scenes found');
        });
    });

    describe('toScriptPlan', () => {
        it('should convert input to script plan with mode', () => {
            const input = YouTubeScriptParser.parse(VALID_SCRIPT);
            const plan = YouTubeScriptParser.toScriptPlan(input);

            expect(plan.mode).toBe('youtube-short');
            expect(plan.title).toBe(input.title);
            expect(plan.scenes).toBe(input.scenes);
            expect(plan.totalDurationSeconds).toBe(input.totalDurationSeconds);
        });
    });
});
