/**
 * Parable Caption & Hashtag Integration Test
 * 
 * This test validates that the LLM actually generates hashtags correctly
 * using REAL Gpt API calls (not mocks). Run manually when debugging
 * hashtag generation issues.
 * 
 * Run with: npx ts-node tests/integration/ParableCaptionLive.test.ts
 */

import { GptLlmClient } from '../../src/infrastructure/llm/GptLlmClient';
import { ParableScriptPlan, ParableIntent, ParableSourceChoice } from '../../src/domain/entities/Parable';
import { config } from 'dotenv';

// Load environment variables
config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY environment variable not set');
    process.exit(1);
}

// Sample parable script for testing
const sampleParableScript: ParableScriptPlan = {
    mode: 'parable',
    parableIntent: {
        sourceType: 'provided-story',
        coreTheme: 'atomic habits and discipline',
        moral: 'Those who compound in silence always embarrass those who had every advantage.',
        culturalPreference: 'indian',
        providedStoryContext: 'Ekalavya practiced archery alone using a clay statue of Dronacharya as his teacher. He eventually surpassed the royal princes.'
    },
    sourceChoice: {
        culture: 'indian',
        archetype: 'student',
        rationale: 'Matches Ekalavya archery story'
    },
    beats: [
        {
            role: 'hook',
            narration: 'There was a tribal boy named Ekalavya whose only teacher was a clay statue.',
            textOnScreen: 'The Forgotten Archer',
            imagePrompt: '2D cel-shaded, young Indian boy in forest with bow',
            approxDurationSeconds: 9
        },
        {
            role: 'setup',
            narration: 'While princes trained under Dronacharya, the greatest teacher, Ekalavya practiced alone. Day after day. Arrow after arrow.',
            textOnScreen: 'No teacher. No recognition.',
            imagePrompt: '2D cel-shaded, forest practice scene with clay statue',
            approxDurationSeconds: 12
        },
        {
            role: 'turn',
            narration: 'But here\'s what nobody told him. When the princes finally met him, they couldn\'t believe their eyes. The outcast had surpassed them all.',
            textOnScreen: 'The outcast surpassed them all.',
            imagePrompt: '2D cel-shaded, shocked princes watching archer, DARKER palette',
            approxDurationSeconds: 11
        },
        {
            role: 'moral',
            narration: 'The ones who compound in silence always embarrass those who had every advantage. Your excuses are showing.',
            textOnScreen: 'Your excuses are showing.',
            imagePrompt: '2D cel-shaded, determined eyes, BRIGHTER palette',
            approxDurationSeconds: 9
        }
    ]
};

async function testCaptionGeneration() {
    console.log('=== PARABLE CAPTION & HASHTAG LIVE TEST ===\n');

    const client = new GptLlmClient(OPENAI_API_KEY!);

    console.log('1. Testing generateParableCaptionAndTags...\n');

    try {
        const result = await client.generateParableCaptionAndTags(
            sampleParableScript,
            'atomic habits and discipline'
        );

        console.log('CAPTION BODY:');
        console.log('---');
        console.log(result.captionBody);
        console.log('---\n');

        console.log('HASHTAGS:');
        console.log('---');
        console.log(result.hashtags);
        console.log('---\n');

        console.log('VALIDATION:');
        console.log(`  - Caption length: ${result.captionBody.length} chars (should be > 20)`);
        console.log(`  - Hashtag count: ${result.hashtags.length} (should be >= 8)`);
        console.log(`  - Has #ChallengingView: ${result.hashtags.includes('#ChallengingView')}`);
        console.log(`  - All start with #: ${result.hashtags.every(t => t.startsWith('#'))}`);

        // Assertions
        if (result.captionBody.length < 20) {
            console.error('\n❌ FAIL: Caption body too short');
            process.exit(1);
        }
        if (result.hashtags.length < 8) {
            console.error(`\n❌ FAIL: Only ${result.hashtags.length} hashtags (need >= 8)`);
            process.exit(1);
        }
        if (!result.hashtags.includes('#ChallengingView')) {
            console.error('\n❌ FAIL: Missing #ChallengingView brand hashtag');
            process.exit(1);
        }
        if (!result.hashtags.every(t => t.startsWith('#'))) {
            console.error('\n❌ FAIL: Some hashtags missing # prefix');
            process.exit(1);
        }

        console.log('\n✅ ALL VALIDATIONS PASSED!\n');

    } catch (error) {
        console.error('❌ ERROR during caption generation:', error);
        process.exit(1);
    }
}

async function testExtractParableIntent() {
    console.log('2. Testing extractParableIntent with sample transcript...\n');

    const client = new GptLlmClient(OPENAI_API_KEY!);

    const sampleTranscript = `
    I want to tell a parable about Ekalavya from Indian history. 
    He's the tribal boy who couldn't get a teacher, but practiced archery alone in the forest every single day.
    He shot at a clay statue of Dronacharya, his imaginary teacher.
    Small daily practice. No recognition. No validation. Just repetition.
    Until he became better than the royal princes who had everything.
    The moral? The ones who compound in silence always embarrass those who had every advantage.
    `;

    try {
        const intent = await client.extractParableIntent(sampleTranscript);

        console.log('EXTRACTED INTENT:');
        console.log(JSON.stringify(intent, null, 2));
        console.log('\n');

        console.log('VALIDATION:');
        console.log(`  - sourceType: ${intent.sourceType} (should be provided-story)`);
        console.log(`  - coreTheme: ${intent.coreTheme}`);
        console.log(`  - moral: ${intent.moral}`);
        console.log(`  - culturalPreference: ${intent.culturalPreference}`);
        console.log(`  - providedStoryContext includes Ekalavya: ${intent.providedStoryContext?.includes('Ekalavya')}`);
        console.log(`  - providedStoryContext includes Dronacharya: ${intent.providedStoryContext?.includes('Dronacharya')}`);

        // Assertions
        if (intent.sourceType !== 'provided-story') {
            console.error('\n❌ FAIL: Should detect provided-story');
            process.exit(1);
        }
        if (!intent.providedStoryContext?.includes('Ekalavya')) {
            console.error('\n❌ FAIL: providedStoryContext should include Ekalavya');
            process.exit(1);
        }

        console.log('\n✅ INTENT EXTRACTION PASSED!\n');

    } catch (error) {
        console.error('❌ ERROR during intent extraction:', error);
        process.exit(1);
    }
}

describe('Parable Caption & Hashtag Live Test', () => {
    jest.setTimeout(60000); // 1 minute for live API calls

    it('should extract parable intent and generate captions/hashtags', async () => {
        await testExtractParableIntent();
        await testCaptionGeneration();
    });
});
