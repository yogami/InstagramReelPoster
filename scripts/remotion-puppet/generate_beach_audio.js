require('dotenv').config({ path: '../../.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY;
// Male voice for the guy
const MALE_VOICE = process.env.FISH_AUDIO_VOICE_ID || '716594c03801446bb87a964a1c2a5895';
// Female voice for the girl
const FEMALE_VOICE = process.env.FISH_AUDIO_SCENARIO_FEMALE_VOICE_ID || '3895f5f7c6ac43f092bec1b2c04f431f';

const DIALOGUE = [
    {
        speaker: 'guy',
        voice: MALE_VOICE,
        line: "You know what I love about this place? No deadlines. No emails. Just the waves.",
        file: 'guy_line1.wav'
    },
    {
        speaker: 'girl',
        voice: FEMALE_VOICE,
        line: "Mmm. I could stay here forever. Play me that song again, the one from last night.",
        file: 'girl_line1.wav'
    },
    {
        speaker: 'guy',
        voice: MALE_VOICE,
        line: "This one? I actually wrote it this morning. Inspired by the sunrise.",
        file: 'guy_line2.wav'
    },
];

async function generateTTS(text, voiceId, filename) {
    console.log(`Generating TTS: "${text.substring(0, 40)}..."`);
    const payload = {
        text: text,
        reference_id: voiceId,
        format: "wav",
        normalize: true,
        latency: "normal"
    };

    const response = await axios.post('https://api.fish.audio/v1/tts', payload, {
        headers: {
            'Authorization': `Bearer ${FISH_API_KEY}`,
            'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
    });

    const outputPath = path.join(__dirname, 'public', filename);
    fs.writeFileSync(outputPath, response.data);
    console.log(`✅ Saved: ${outputPath}`);
    return outputPath;
}

function getAudioDuration(filePath) {
    // Use ffprobe to get exact duration in seconds
    const result = execSync(
        `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`
    ).toString().trim();
    return parseFloat(result);
}

async function main() {
    const timeline = [];
    let currentTimeSeconds = 0;

    for (const turn of DIALOGUE) {
        const filePath = await generateTTS(turn.line, turn.voice, turn.file);
        const duration = getAudioDuration(filePath);
        const startFrame = Math.round(currentTimeSeconds * 30);
        const durationFrames = Math.round(duration * 30);

        timeline.push({
            speaker: turn.speaker,
            file: turn.file,
            line: turn.line,
            startFrame,
            durationFrames,
            durationSeconds: duration,
        });

        console.log(`   Duration: ${duration.toFixed(2)}s | Start Frame: ${startFrame} | Duration Frames: ${durationFrames}`);

        // Add a small gap (0.4s) between lines for natural pacing
        currentTimeSeconds += duration + 0.4;
    }

    // Write the timeline JSON for Remotion to consume
    const timelinePath = path.join(__dirname, 'public', 'timeline.json');
    fs.writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
    console.log(`\n✅ Timeline written to ${timelinePath}`);
    console.log(`Total video duration: ${currentTimeSeconds.toFixed(2)}s (${Math.ceil(currentTimeSeconds * 30)} frames)`);
    console.log(JSON.stringify(timeline, null, 2));
}

main().catch(e => console.error("❌ FAILED:", e.message));
