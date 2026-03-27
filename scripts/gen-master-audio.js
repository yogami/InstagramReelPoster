
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');
const axios = require('axios');

async function synthesizePrecise(text, voiceId, apiKey, filename) {
    const response = await axios.post(
        'https://api.fish.audio/v1/tts',
        {
            text: text.trim(),
            reference_id: voiceId,
            format: 'mp3',
            speed: 1.6,
        },
        {
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            responseType: 'arraybuffer',
        }
    );
    fs.writeFileSync(filename, Buffer.from(response.data));
    console.log(`Saved: ${filename}`);
}

async function prepareFinalAudio() {
    const apiKey = process.env.FISH_AUDIO_API_KEY;
    const voiceId = '716594c03801446bb87a964a1c2a5895';

    // Segmented into natural paragraphs to avoid split lines
    const script = [
        "The AI revolution faces a massive trust crisis. Enterprises are deploying agents at scale, but they are opaque boxes—black holes where data and decisions disappear. Relying on post-hoc logs is like looking at a car crash through the rearview mirror. Traditional methods can't stop a policy violation or a PII leak at runtime. You need more than observability. You need runtime enforcement.",
        "Welcome to AgentOps Mission Control—the world's first runtime enforcement registry. Total visibility starts with Discovery. Our registry allows you to identify every agent in your stack. Let's find a GDPR-compliant HR screener for a hiring workflow. Our Capability Broker performs a semantic query to identify real agent identities, not just strings. This level of unique verification is what sets us apart.",
        "But how can we actually trust their internal math? Introducing Zero-Knowledge Governance—the core of our Trust Protocol. Watch as the agent generates a cryptographic SNARK proof of performance metrics without ever revealing its internal weights or your private training data. The Trust Verifier node analyzes the proof in real-time and issues a portable, W-3-C Verifiable Credential. This ensures your compliance is mathematically guaranteed.",
        "Scaling security requires orchestration. Our Kanban dashboard offers a unified view of your entire autonomous workforce across multiple vendors. Moving an agent from a sandbox to production triggers automated policy-checking workflows. We uniquely normalize context and semantic alignment across multi-vendor fleets—from OpenAI to Azure—maintaining strict compliance during every handoff.",
        "Anomalies are detected in milliseconds. From PII leaks to behavioral drift, our AI-powered scanners identify threats before they can cause damage. High-risk decisions are routed to our Human-in-the-Loop panel, ensuring that sovereign human control remains at the center of your AI strategy. And if a system breaches safe bounds? Our global kill switch can freeze your entire fleet instantly. You are in total control.",
        "With the EU AI Act arriving in 2026, verifiable certainty is no longer optional. Logs aren't enough—you need portable, runtime governance that moves with your business. AgentOps Mission Control bridges that gap. We are Berlin AI Labs. Don't just build your AI—govern it. Join our enterprise trial today at berlin-ai-labs dot de slash registry and lead the shift to safe, sovereign AI."
    ].join('\n\n');

    await synthesizePrecise(script, voiceId, apiKey, 'master_pitch_v6.mp3');
}

prepareFinalAudio().catch(console.error);
