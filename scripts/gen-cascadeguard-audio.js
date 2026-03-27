
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');

const { CloningTtsClient } = require(path.resolve(process.cwd(), 'dist/infrastructure/tts/CloningTtsClient'));

async function generateCascadeGuardPitch() {
    console.log('Starting CascadeGuard Pitch generation...');

    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';

    const client = new CloningTtsClient(apiKey, voiceId);

    // Speed: 1.15x (Psychologically optimized for Authority - "The Voice of God" pacing)
    // Tone: Serious, Warning, Confident, Scientific.
    const sections = [
        "Your supply chain isn't just inefficient. It is mathematically fragile. Thirty three point two percent. That is the probability your network survives a standard N minus 2 shock.",
        "You think you have diversified. You haven't. You have built a Scale-Free Network. Efficient in peace. Catastrophic in war. A single hub failure triggers a systemic cardiac arrest.",
        "We didn't ask you for data. We inferred it. Using public signals, we built a Digital Twin of a standard Tier 1 automotive network. We mapped the hubs. We mapped the flows.",
        "Then... we broke it. We ran the Flow Sentinel. An adversarial algorithm that finds your weakest links and snaps them. The result? Total collapse. Thirty three percent resilience.",
        "The fix isn't more inventory. It's Topology. We don't just find the break. We restructure the mesh to survive it. Resilient. Distributed. Unbreakable.",
        "We know our Twin is fragile. The question is... is your real network any better? Upload your topology. If you beat 33 percent, you're safe. If you don't... we need to talk."
    ];

    // Combining into one distinct audio file for easier stitching later
    for (let i = 0; i < sections.length; i++) {
        const text = sections[i];
        console.log(`Synthesizing Segment ${i + 1}...`);
        try {
            const result = await client.synthesize(text, {
                speed: 1.15, // Gravitas speed
                format: 'mp3'
            });

            if (result.audioUrl.startsWith('data:')) {
                const base64Data = result.audioUrl.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                const outputPath = path.resolve(process.cwd(), `output/cascadeguard_voice_${i + 1}.mp3`);
                if (!fs.existsSync(path.resolve(process.cwd(), 'output'))) {
                    fs.mkdirSync(path.resolve(process.cwd(), 'output'));
                }
                fs.writeFileSync(outputPath, buffer);
                console.log(`SUCCESS: Segment ${i + 1} saved to:`, outputPath);
            }
        } catch (error) {
            console.error(`FAILURE Segment ${i + 1}:`, error);
        }
    }
}

generateCascadeGuardPitch();
