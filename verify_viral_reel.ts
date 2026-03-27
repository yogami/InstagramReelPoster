
import 'dotenv/config';
import { GeminiService } from './src/infrastructure/llm/GeminiService';
import { StandardReelGenerator } from './src/infrastructure/llm/StandardReelGenerator';
import { PlanningConstraints } from './src/domain/ports/ILlmClient';

async function verify() {
    console.log('Starting Viral Content Verification (Gemini)...');

    const apiKey = process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) {
        console.error('Error: GOOGLE_AI_API_KEY is not set in .env');
        process.exit(1);
    }

    // specific model 'gemini-1.5-pro' for Ultra plan features
    const chatService = new GeminiService(apiKey, 'gemini-1.5-pro');
    const generator = new StandardReelGenerator(chatService);

    const transcript = "Everyone keeps saying you need to go find yourself. Like you're lost. You're not lost. You're just distracted. You don't need to go to Bali to find yourself. You need to build yourself right here. Stop searching and start creating.";

    const constraints: PlanningConstraints = {
        minDurationSeconds: 15,
        maxDurationSeconds: 30
    };

    try {
        console.log('--- PLANNING REEL ---');
        const plan = await generator.planReel(transcript, constraints);
        console.log('Summary:', plan.summary);
        console.log('Mood:', plan.mood);
        console.log('Audio Mood:', plan.audioMood); // Should be present now
        console.log('Zoom Sequence:', plan.zoomSequence);

        console.log('\n--- GENERATING HOOKS ---');
        const hooks = await generator.generateHooks(transcript, plan);
        console.log('Hooks:', hooks); // Should see "Unsettling Truth" style

        console.log('\n--- GENERATING SEGMENTS ---');
        const segments = await generator.generateSegmentContent(plan, transcript);

        segments.forEach((seg, i) => {
            console.log(`\nSegment ${i + 1}:`);
            console.log(`Commentary: ${seg.commentary}`);
            console.log(`Visual Prompt: ${seg.imagePrompt}`); // Should see "Entropism", "Gritty"
        });

    } catch (error) {
        console.error('Verification failed:', error);
    }
}

verify();
