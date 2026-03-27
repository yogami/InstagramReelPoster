
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');

const { CloningTtsClient } = require(path.resolve(process.cwd(), 'src/infrastructure/tts/CloningTtsClient'));

async function generatePitch() {
    console.log('Starting pitch generation...');

    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';

    const client = new CloningTtsClient(apiKey, voiceId);

    const sections = [
        "Welcome to AgentOps Mission Control - Europe's compliant AI agent registry. We solve the 'black box' problem for EU teams with vetted agents, ZK proofs, and zero-log certainty. Scaling safely starts here.",
        "Let's dive into Discovery. Need a 'GDPR HR screener'? Most marketplaces give you a promise; we give you proof. Our Capability Broker performs a semantic search to find agents that don't just work, but comply. See the ZK-Scorecard? This is the heart of Mission Control - it mathematically proves an agent's compliance without exposing sensitive data. Behind the scenes, our Fairness Auditor and ConvoGuard engines are working 24/7 to auto-vet every interaction. Look for the 'EU Verified' badge - it’s not for show. It represents a rigorous, automated verification process that guarantees your AI operations meet the highest standards of European safety and trust. No more guessing - just verified intelligence.",
        "Orchestration shouldn't be a nightmare. Our Kanban interface lets you manage your agent fleet with drag-and-drop precision. Moving an agent from testing to production? The Semantic Aligner normalizes context across vendors - OpenAI to Azure - maintaining compliance every step of the way. We’ve built in a Deadline Enforcer to kill hangs before they cost you, and our global kill switch is always live. You’re in total control of your autonomous workforce, with multi-vendor routing that’s as portable as it is secure.",
        "Cloud lock-in is a governance trap. AWS tells you what you've done; Mission Control tells you you're safe before you even start. With the EU AI Act arriving in Q1 2026, logs aren't enough. You need portable, verifiable governance that moves with your business. We bridge the gap between innovation and the law.",
        "Ready to scale? Our ninety-nine Euro enterprise trial is live right now at berlin-ai-labs dot de slash registry. Don't just build AI - govern it. We are Berlin AI Labs, and we’re building the infrastructure for a sovereign, safe, and vetted AI future in Europe. Join us and let’s lead the shift together."
    ];
    const script = sections.join('\n\n');

    console.log('Synthesizing audio...');
    try {
        const result = await client.synthesize(script, {
            speed: 1.6,
            format: 'mp3'
        });

        // result.audioUrl is either a URL or a data URI
        if (result.audioUrl.startsWith('data:')) {
            const base64Data = result.audioUrl.split(',')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const outputPath = path.resolve(process.cwd(), 'output_pitch_voiceover.mp3');
            fs.writeFileSync(outputPath, buffer);
            console.log('SUCCESS: Voiceover saved to:', outputPath);
        } else {
            console.log('Voiceover available as URL:', result.audioUrl);
            // We might want to download it if it's a URL
        }
    } catch (error) {
        console.error('FAILURE:', error);
    }
}

generatePitch();
