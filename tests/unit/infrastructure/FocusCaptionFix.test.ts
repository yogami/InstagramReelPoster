import { StandardReelGenerator } from '../../../src/infrastructure/llm/StandardReelGenerator';
import { GptService } from '../../../src/infrastructure/llm/GptService';
import { ReelPlan } from '../../../src/domain/ports/ILlmClient';

describe('StandardReelGenerator - "Focus" Caption TDD', () => {
    let generator: StandardReelGenerator;
    let mockGpt: jest.Mocked<GptService>;

    const userTranscript = `1 minute instagram video reel on "Title: Kid Knew Dead Grandma's Birthday
Three year old kid said Grandma's birthday is March 17th. She died ten years before he was born. I was skeptical too.
But then kids remembering past life siblings they never met. Hungarian villages verified by researchers.
My own out of body experiences. Near death light tunnels. Dead relatives visiting in full moon dreams.
Is life just chemical soup in skull? Or something we can't measure yet?
Think about it. Save if it cracks your vie`;

    beforeEach(() => {
        mockGpt = {
            chatCompletion: jest.fn(),
            parseJSON: jest.fn(),
        } as any;
        generator = new StandardReelGenerator(mockGpt);
    });

    it('should extract meaningful captions from segments when LLM output is malformed', async () => {
        // Mock Step 1: generateCommentary
        mockGpt.chatCompletion.mockResolvedValueOnce(JSON.stringify({
            commentary: "Three year old kid said Grandma's birthday is March 17th."
        }));

        // Mock Step 2: generateVisuals - Simulate MALFORMED response that triggers fallback
        mockGpt.chatCompletion.mockResolvedValueOnce("MALFORMED RESPONSE");
        mockGpt.parseJSON.mockImplementation((str) => {
            if (str === "MALFORMED RESPONSE") throw new Error("Parse error");
            return JSON.parse(str);
        });

        const plan: ReelPlan = {
            summary: "Grandma's Birthday Mystery",
            mood: "mysterious",
            targetDurationSeconds: 60,
            segmentCount: 1,
            musicTags: ['mysterious'],
            musicPrompt: 'mysterious music',
            mainCaption: "Proof of Afterlife?",
            zoomSequence: ['slow_zoom_in']
        };

        const result = await generator.generateSegmentContent(plan, userTranscript);

        expect(result[0].caption).not.toBe('Insight');
        expect(result[0].caption?.toLowerCase()).toContain('grandma'); // "Three year old kid said Grandma's..." (7 words)
        expect(result[0].imagePrompt).toContain("Grandma's Birthday Mystery");
    });

    it('should NOT return "Insight" if the LLM returns a wrapped object with a missing inner key', async () => {
        // Mock Step 1: generateCommentary
        mockGpt.chatCompletion.mockResolvedValueOnce(JSON.stringify({
            commentary: "Hungarian villages verified by researchers."
        }));

        // Mock Step 2: generateVisuals - Return object that doesn't match 'visuals' or other expected keys
        mockGpt.chatCompletion.mockResolvedValueOnce(JSON.stringify({
            some_other_key: [{ imagePrompt: "village", caption: "Verified" }]
        }));
        mockGpt.parseJSON.mockImplementation((str) => JSON.parse(str));

        const plan: ReelPlan = {
            summary: "Research",
            mood: "analytical",
            targetDurationSeconds: 60,
            segmentCount: 1,
            musicTags: ['tech'],
            musicPrompt: 'tech music',
            mainCaption: "Science?",
            zoomSequence: ['static']
        };

        const result = await generator.generateSegmentContent(plan, userTranscript);

        expect(result[0].caption).not.toBe('Insight');
        expect(result[0].caption?.toLowerCase()).toContain('verified');
    });
});
