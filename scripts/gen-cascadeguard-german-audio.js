
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

async function generateGermanAudio() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
        console.error("❌ OPENAI_API_KEY not found in .env");
        process.exit(1);
    }

    // German segments: Formal, Authoritative ("Sie"), Technical/Brutal tone.
    const segments = [
        "Das ist CascadeGuard. Die weltweit erste topologische Risiko-Engine. Wir stellen eine einfache, gefährliche Frage: Ist Ihre Lieferkette mathematisch solvent oder nur ein Kartenhaus?",
        "Das Problem versteckt sich im Offenen. Skalenfreie Fragilität. Ihre Effizienz hat kritische, unsichtbare Engpässe geschaffen. Ein Ausfall hier stoppt nicht nur eine Fabrik. Er kollabiert das gesamte Netzwerk.",
        "Zum Beweis haben wir einen Digitalen Zwilling eines Standard-Tier-Eins-Netzwerks gebaut. Ohne Erlaubnis. Ohne interne Daten. Wir haben die Topologie direkt aus globalen Handelssignalen abgeleitet.",
        "Dann starteten wir den Flow Sentinel. Wir simulierten einen versteckten Knotenausfall. Das Ergebnis? Ein katastrophaler Flusseinbruch von zweiundsechzig Prozent. Effizient? Ja. Resilient? Absolut nicht.",
        "Die Lösung ist CascadeGuard. Wir finden nicht nur den Bruch. Wir reparieren das Netz. Unsere Algorithmen strukturieren Ihre Topologie mathematisch neu – und stellen achtundachtzig Prozent Resilienz wieder her.",
        "Verlassen Sie sich nicht auf Glück. Verlassen Sie sich auf Beweise. Laden Sie Ihre Topologie zur Live Challenge hoch. Wenn Sie den Digitalen Zwilling schlagen, sind Sie sicher. Wenn nicht... müssen wir reden."
    ];

    const outputDir = path.resolve(process.cwd(), 'output_german');
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

    for (let i = 0; i < segments.length; i++) {
        console.log(`🎙️  Synthesizing German Segment ${i + 1}...`);

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
                    voice: "onyx", // Deep male voice works well for authority in German too
                    speed: 1.05
                })
            });

            if (!response.ok) {
                const err = await response.text();
                throw new Error(`OpenAI API Error: ${err}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const outFile = path.join(outputDir, `cascadeguard_german_${i + 1}.mp3`);
            fs.writeFileSync(outFile, buffer);
            console.log(`✅ Saved: ${outFile}`);

        } catch (error) {
            console.error(`❌ Failed Segment ${i + 1}:`, error);
        }
    }
}

generateGermanAudio();
