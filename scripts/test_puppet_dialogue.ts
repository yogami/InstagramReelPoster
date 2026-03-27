/**
 * End-to-end test: Full puppet dialogue pipeline.
 * Topic: UG Krishnamurti perspective on relationships, sex, and novelty addiction.
 * 
 * Usage: npx ts-node scripts/test_puppet_dialogue.ts
 */
import dotenv from 'dotenv';
dotenv.config();

import { PuppetDialogueGenerator } from '../src/application/services/PuppetDialogueGenerator';
import { SovereignPuppetEngine } from '../src/lib/product-demo/domain/services/SovereignPuppetEngine';
import { OpenRouterTextClient } from '../src/infrastructure/llm/OpenRouterTextClient';
import { getConfig } from '../src/config';

async function main() {
    const config = getConfig();
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const openRouterModel = 'google/gemma-3-27b-it:free';

    if (!openRouterKey) throw new Error('OPENROUTER_API_KEY not set in .env');

    const thought = `Why does sex feel dull after a while in a relationship? A couple realizes their addiction to novelty and variety from past experiences prevents them from enjoying long-term pair bonding. Based on UG Krishnamurti's idea that sex is only for reproduction but humans turned it into a pleasure chase wanting variety. When that excitement fades, the relationship reduces to what each person can get from the other, and resentment builds. They try tantra to slow things down but their past keeps preventing them from seeing each other for who they really are. They finally realize they loved each other's ideas — a projection of who they imagined the other person to be, not the actual person. Keep it raw and simple — no philosophical jargon. Like two real people having a tough late-night conversation.`;

    console.log('\n🎭 === PUPPET DIALOGUE PIPELINE: E2E TEST ===\n');
    console.log(`Topic: UG Krishnamurti — sex, novelty, pair bonding`);
    console.log(`LLM: OpenRouter → ${openRouterModel}\n`);

    // Step 1: Generate dialogue via OpenRouter LLM
    console.log('--- Step 1: Generating dialogue via OpenRouter ---');
    const llmClient = new OpenRouterTextClient(openRouterKey, openRouterModel);
    const dialogueGen = new PuppetDialogueGenerator(llmClient as any);
    const result = await dialogueGen.generateDialogue(thought);

    console.log(`\nScene: ${result.scene}`);
    console.log(`Caption: ${result.caption}`);
    console.log(`Turns: ${result.turns.length}`);
    result.turns.forEach((t, i) => {
        console.log(`  [${i + 1}] ${t.speaker.toUpperCase()}: "${t.line}"`);
    });

    // Step 2: Execute the full engine pipeline (TTS + Render + Upload)
    console.log('\n--- Step 2: Executing Sovereign Puppet Engine ---');
    const engine = new SovereignPuppetEngine({
        replicateApiToken: config.replicateApiToken,
        fishApiKey: config.ttsCloningApiKey,
        fishMaleVoiceId: config.scenarioMaleVoiceId || '716594c03801446bb87a964a1c2a5895',
        fishFemaleVoiceId: config.scenarioFemaleVoiceId || '716594c03801446bb87a964a1c2a5895',
        cloudinaryCloudName: config.cloudinaryCloudName,
        cloudinaryApiKey: config.cloudinaryApiKey,
        cloudinaryApiSecret: config.cloudinaryApiSecret,
        makeWebhookUrl: config.makeWebhookUrl || '',
        makeApiKey: '',
    });

    const jobId = `test_ug_${Date.now()}`;
    const finalUrl = await engine.execute(
        jobId,
        result.caption,
        result.visualPrompt,
        result.turns
    );

    console.log(`\n✅ === PIPELINE COMPLETE ===`);
    console.log(`Video URL: ${finalUrl}`);
    console.log(`Caption: ${result.caption}`);
}

main().catch(err => {
    console.error('❌ Pipeline failed:', err);
    process.exit(1);
});
