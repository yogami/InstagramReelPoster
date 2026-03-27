require('dotenv').config({ path: '../../.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
const ARYA_VOICE = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
const SENECA_VOICE = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID || '3895f5f7c6ac43f092bec1b2c04f431f';

async function generateTTS(text, voiceId, filename) {
    console.log(`Generating TTS for: ${text.substring(0, 30)}...`);
    const payload = {
        text: text,
        reference_id: voiceId,
        format: "wav",
        normalize: true,
        latency: "normal"
    };

    try {
        const response = await axios.post('https://api.fish.audio/v1/tts', payload, {
            headers: {
                'Authorization': `Bearer ${FISH_API_KEY}`,
                'Content-Type': 'application/json'
            },
            responseType: 'arraybuffer'
        });

        const outputPath = path.join(__dirname, 'public', filename);
        fs.writeFileSync(outputPath, response.data);
        console.log(`✅ Saved audio to ${outputPath}`);
    } catch (error) {
        console.error("❌ Audio extraction failed:", error.response ? error.response.data : error.message);
    }
}

async function main() {
    // Character A (Arya)
    await generateTTS(
        "Did you read the new compliance memo? It's completely absurd.",
        ARYA_VOICE,
        "speaker_A.wav"
    );

    // Character B (Seneca)
    await generateTTS(
        "I would rather drink battery acid. They think NDAs cover telepathy now.",
        SENECA_VOICE,
        "speaker_B.wav"
    );
}

main();
