/**
 * Direct execution test: bypasses LLM (Gemini rate-limited).
 * Pre-written dialogue based on UG Krishnamurti relationship dynamics.
 * Runs: Fish Audio TTS → Remotion render → Cloudinary upload.
 */
import dotenv from 'dotenv';
dotenv.config();

import { SovereignPuppetEngine } from '../src/lib/product-demo/domain/services/SovereignPuppetEngine';
import { getConfig } from '../src/config';

async function main() {
    const config = getConfig();

    const caption = `"We never saw each other... we saw what we wanted to see." 💔\n\nWhen the chase ends, what's left?\n\n#relationships #honesty #pairbonding #latenighttalks #realness`;

    const visualPrompt = `Two empty coffee cups on a wooden table in a dimly lit apartment at 2am, moonlight through the window, intimate and melancholic atmosphere, cinematic lighting, photorealistic, 9:16 vertical`;

    const turns = [
        { speaker: "marco" as const, line: "Do you remember when we couldn't keep our hands off each other?" },
        { speaker: "luna" as const, line: "Yeah... that was a long time ago." },
        { speaker: "marco" as const, line: "What happened to us? Like... it's not that I don't want you. I just... I don't feel that fire anymore." },
        { speaker: "luna" as const, line: "Maybe the fire was never about us. Maybe it was about the newness... the chase." },
        { speaker: "marco" as const, line: "That's what scares me. Because before you... I always moved on when things got boring. New person, new rush." },
        { speaker: "luna" as const, line: "And now you can't do that. So you're stuck... with just me." },
        { speaker: "marco" as const, line: "I tried the tantra thing. Slowing down. Being present. But my mind keeps comparing... to before." },
        { speaker: "luna" as const, line: "You know what I realized? I didn't fall in love with you. I fell in love with my idea of you." },
        { speaker: "marco" as const, line: "What do you mean?" },
        { speaker: "luna" as const, line: "I built this version of you in my head. And now I'm mad because the real you doesn't match." },
        { speaker: "marco" as const, line: "So we were both chasing something that was never real." },
        { speaker: "luna" as const, line: "Yeah. And maybe that's okay. Maybe now we get to actually meet each other... for the first time." },
    ];

    console.log('\n🎭 === PUPPET DIALOGUE: DIRECT EXECUTION ===\n');
    console.log(`Topic: UG Krishnamurti — relationships, novelty, projection`);
    console.log(`Turns: ${turns.length}\n`);
    turns.forEach((t, i) => console.log(`  [${i+1}] ${t.speaker.toUpperCase()}: "${t.line}"`));

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

    const jobId = `ug_couple_${Date.now()}`;
    const finalUrl = await engine.execute(jobId, caption, visualPrompt, turns);

    console.log(`\n✅ === PIPELINE COMPLETE ===`);
    console.log(`Video URL: ${finalUrl}`);
    console.log(`Caption:\n${caption}`);
}

main().catch(err => {
    console.error('❌ Pipeline failed:', err);
    process.exit(1);
});
