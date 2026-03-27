
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

async function generateOpenAIAudio() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("❌ OPENAI_API_KEY not found in .env");
        process.exit(1);
    }

    const segments = [
        "This is CascadeGuard. The world's first topological risk engine. We ask one simple, dangerous question: Is your supply chain mathematically solvent, or is it a house of cards?",
        "The Problem is hidden in plain sight. It is called Scale-Free Fragility. Your drive for efficiency has created critical, invisible chokepoints. One failure here doesn't just stop a factory; it collapses the entire network.",
        "To prove it, we built a Digital Twin of a standard Tier 1 network. We didn't ask for permission, and we didn't ask for data. We inferred the topology directly from global trade signals.",
        "Then, we launched the Flow Sentinel. We simulated a hidden hub failure. The result? A catastrophic 62 percent drop in flow. Efficient? Yes. Resilient? Absolutely not.",
        "The Solution is CascadeGuard. We don't just find the break; we fix the mesh. Our algorithms mathematically restructure your topology, bypassing failure points and restoring resilience to 88 percent.",
        "Don't rely on luck. Rely on proof. Upload your network topology to the Live Challenge. If you can beat the Digital Twin, you're safe. If not... we need to talk."
    ];

    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    for (let i = 0; i < segments.length; i++) {
        console.log(`🎙️  Synthesizing Segment ${i + 1}...`);

        try {
            const response = await fetch("https://api.openai.com/v1/audio/speech", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    model: "tts-1-hd",
                    input: segments[i],
                    voice: "onyx", // Deep, professional male
                    speed: 1.05 // Slightly faster for punchiness
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`OpenAI API Error: ${err}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const outFile = path.join(outputDir, `cascadeguard_openai_${i + 1}.mp3`);
            fs.writeFileSync(outFile, buffer);
            console.log(`✅ Saved: ${outFile}`);

        } catch (error) {
            console.error(`❌ Failed Segment ${i + 1}:`, error);
        }
    }
}

generateOpenAIAudio();
