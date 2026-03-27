
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const { CloningTtsClient } = require(path.resolve(process.cwd(), 'src/infrastructure/tts/CloningTtsClient'));

async function generatePrecisePitch() {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = '2fcfdf3229d94dc2bcb02b2c35405545';

    const client = new CloningTtsClient(apiKey, voiceId);

    const scriptSegments = [
        { id: 'intro_problem', text: "The AI revolution has a massive trust problem. Enterprises are deploying agents at scale, but they’re flying blind. Traditional logs are just history—they can’t stop a policy violation or a PII leak at runtime. This is the governance gap." },
        { id: 'solution_intro', text: "Enter AgentOps Mission Control. We aren’t just another observability tool; we are the world’s first runtime enforcement registry. Unlike competitors who just watch, we verify." },
        { id: 'discovery_search', text: "Let’s look at Discovery. When you search for a 'GDPR HR screener', we don't just show you a description. We show you a verified identity." },
        { id: 'zk_scorecard', text: "See this ZK-Scorecard? We use Zero-Knowledge proofs to mathematically guarantee that an agent adheres to your specific SLAs—like latency or data residency—without ever exposing its internal weights or your private data. This is ZK-Governance: compliance proved by math, not promises." },
        { id: 'orchestration_kanban', text: "Orchestration is where most fleets fail. Our Kanban dashboard gives you a single pane of glass to manage complexity. When you drag an agent from testing to production, our Semantic Aligner automatically normalizes context across vendors like OpenAI or Azure, ensuring the switch doesn't break your guardrails." },
        { id: 'governance_alerts', text: "Real-time alerts keep your human-in-the-loop updated on every anomaly, from policy drift to performance spikes." },
        { id: 'kill_switch', text: "And if things go south? We have the ultimate safety net. Our global kill switch is a runtime directive that can freeze your entire fleet in milliseconds." },
        { id: 'closing_cta', text: "The EU AI Act arrives in 2026. Logs won’t be enough; you’ll need verifiable certainty. AgentOps Mission Control bridges that gap. We are Berlin AI Labs. Don’t just build AI—govern it. Join our enterprise trial today at berlin-ai-labs dot de slash registry and lead the shift to safe, sovereign AI." }
    ];

    const fullScript = scriptSegments.map(s => s.text).join('\n\n');

    console.log('Synthesizing high-precision audio...');
    try {
        const result = await client.synthesize(fullScript, {
            speed: 1.6,
            format: 'mp3'
        });

        if (result.audioUrl.startsWith('data:')) {
            const buffer = Buffer.from(result.audioUrl.split(',')[1], 'base64');
            fs.writeFileSync('precise_pitch_v2.mp3', buffer);
            console.log('SUCCESS: Voiceover saved.');

            // Output timing estimations for recording sync
            console.log('--- TIMING ESTIMATES (at 1.6x) ---');
            let totalSeconds = 0;
            for (const s of scriptSegments) {
                const words = s.text.split(' ').length;
                const duration = (words / 1.8) / 1.6; // ~1.8 wps base / 1.6 multiplier
                console.log(`${s.id}: ${duration.toFixed(2)}s (starts at ${totalSeconds.toFixed(2)}s)`);
                totalSeconds += duration;
            }
        }
    } catch (error) {
        console.error('FAILURE:', error);
    }
}

generatePrecisePitch();
