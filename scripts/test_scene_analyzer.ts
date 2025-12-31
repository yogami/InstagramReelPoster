/**
 * Test Script: YouTube Scene Analyzer
 * 
 * Tests the intelligent scene analysis with the Indian plate example.
 */

import dotenv from 'dotenv';
dotenv.config();

import { YouTubeSceneAnalyzer } from '../src/infrastructure/youtube/YouTubeSceneAnalyzer';
import { YouTubeScene } from '../src/domain/entities/YouTubeShort';

const TEST_SCENES: YouTubeScene[] = [
    {
        title: 'The Collision Visual',
        startTime: '0:00',
        endTime: '0:10',
        durationSeconds: 10,
        visualPrompt: 'A high-speed CGI animation of the Indian plate racing across the ocean and slamming into Asia.',
        narration: "India wasn't always where it is today. 100 million years ago, it was an island 'spearhead' breaking away from the South Pole, drifting north at a tectonic 'sprint' of 20 centimeters per year.",
    },
    {
        title: 'The Deccan Fire',
        startTime: '0:10',
        endTime: '0:25',
        durationSeconds: 15,
        visualPrompt: 'Glowing red cracks opening in the earth; vast floods of black lava.',
        narration: "On its journey, India crossed a volcanic hotspot. For a million years, the earth bled lava, creating the Deccan Traps—a volcanic plateau 2,000 meters thick.",
    },
    {
        title: 'The Roof of the World',
        startTime: '0:25',
        endTime: '0:45',
        durationSeconds: 20,
        visualPrompt: 'The Tethys Sea floor crumpling upward into the peaks of the Himalayas.',
        narration: "Then came the Great Collision. As India smashed into Asia, the ancient Tethys Ocean was squeezed upward. Today, you can find marine fossils at the top of Mt. Everest.",
    },
];

const FULL_SCRIPT = TEST_SCENES.map(s =>
    `[${s.title}]\nVisual: ${s.visualPrompt}\nNarration: ${s.narration}`
).join('\n\n');

async function main() {
    console.log('🧠 YouTube Scene Analyzer Test\n');
    console.log('═'.repeat(60));
    console.log('Testing with geological/tectonic scenes to verify disambiguation...\n');

    const analyzer = new YouTubeSceneAnalyzer();

    console.log('📜 Full Script Context:\n');
    console.log(FULL_SCRIPT);
    console.log('\n' + '═'.repeat(60) + '\n');

    const analysis = await analyzer.analyzeScript(
        'The Geological Birth of India',
        TEST_SCENES,
        'Epic & Fast-Paced',
        FULL_SCRIPT
    );

    console.log('\n📊 Analysis Results:\n');

    for (let i = 0; i < analysis.scenes.length; i++) {
        const scene = analysis.scenes[i];
        console.log(`━━━ Scene ${i + 1}: ${scene.original.title} ━━━`);
        console.log(`Asset Type: ${scene.assetType.toUpperCase()}`);
        console.log(`Confidence: ${(scene.confidence * 100).toFixed(0)}%`);
        console.log(`\n📝 Enhanced Prompt:\n${scene.enhancedPrompt}`);
        console.log(`\n🔍 Visual Spec:`);
        console.log(`   Perspective: ${scene.visualSpec.perspective}`);
        console.log(`   Style: ${scene.visualSpec.style}`);
        console.log(`   Subjects: ${scene.visualSpec.subjects.join(', ')}`);
        console.log(`   Action: ${scene.visualSpec.action}`);
        console.log(`   Mood: ${scene.visualSpec.mood}`);
        if (scene.visualSpec.era) console.log(`   Era: ${scene.visualSpec.era}`);
        console.log(`\n💭 Reasoning:\n${scene.reasoning}`);
        console.log('\n');
    }

    if (analysis.warnings.length > 0) {
        console.log('⚠️ Warnings:', analysis.warnings);
    }

    console.log('✅ Analysis complete!');
}

main().catch(console.error);
