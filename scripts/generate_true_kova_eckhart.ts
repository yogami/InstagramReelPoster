import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { FishAudioTtsClient } from '../src/infrastructure/tts/FishAudioTtsClient';
import { KieVideoClient } from '../src/infrastructure/video/KieVideoClient';

dotenv.config();

const FISH_VOICE_ID = process.env.FISH_AUDIO_SCENARIO_MALE_VOICE_ID || "802e3bc2b27e49c2995d23ef70e6ac89";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME!;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY!;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET!;

const TEMP_DIR = '/tmp/kova_true_pipeline';
if (fs.existsSync(TEMP_DIR)) {
  fs.rmSync(TEMP_DIR, { recursive: true, force: true });
}
fs.mkdirSync(TEMP_DIR, { recursive: true });

async function downloadFile(url: string, dest: string) {
    const res = await axios.get(url, { responseType: 'stream' });
    const writer = fs.createWriteStream(dest);
    res.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

function getDuration(file: string): number {
    const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${file}"`).toString().trim();
    return parseFloat(result);
}

async function buildAct(actId: string, narrationText: string, videoPrompt: string, words: {text: string, color: string}[]) {
    console.log(`\n=== Building ${actId} ===`);
    
    // 1. Generate TTS
    const ttsClient = new FishAudioTtsClient(process.env.FISH_AUDIO_API_KEY!, FISH_VOICE_ID);
    const ttsResult = await ttsClient.synthesize(narrationText);
    
    const audioPath = path.join(TEMP_DIR, `${actId}.mp3`);
    fs.writeFileSync(audioPath, Buffer.from(ttsResult.audioUrl.split(',')[1], 'base64'));
    const dur = getDuration(audioPath);
    console.log(`[TTS] Generated: ${dur}s`);

    // 2. Generate Kling Video
    const videoClient = new KieVideoClient(process.env.KIE_API_KEY!);
    const vidResult = await videoClient.generateAnimatedVideo({
        theme: videoPrompt,
        durationSeconds: Math.ceil(dur)
    });
    
    const rawVideoPath = path.join(TEMP_DIR, `${actId}_raw.mp4`);
    console.log(`[Kling] Downloading video from ${vidResult.videoUrl}...`);
    await downloadFile(vidResult.videoUrl, rawVideoPath);

    // 3. Composite with FFmpeg (Kova Typography Overlay)
    const finalVideoPath = path.join(TEMP_DIR, `${actId}_final.mp4`);
    console.log(`[FFmpeg] Compositing...`);
    
    let drawtext = "";
    words.forEach((w, index) => {
        const yOffset = (index - words.length/2) * 120;
        drawtext += `drawtext=text='${w.text}':fontcolor=${w.color}:fontsize=90:fontfile=/System/Library/Fonts/Impact.ttf:x=(w-text_w)/2:y=(h-text_h)/2+${yOffset}:shadowcolor=black:shadowx=4:shadowy=4,`;
    });
    drawtext = drawtext.slice(0, -1);

    // We scale the Kling video to 1080x1920 (crop to vertical), add the typography, add the audio, and trim to exact audio duration.
    const cmd = `ffmpeg -y -i "${rawVideoPath}" -i "${audioPath}" ` +
                `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${drawtext.replace(/fontfile=[^:]+:/, '')}" ` + 
                `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t ${dur} "${finalVideoPath}" -loglevel error`;

    execSync(cmd);
    return finalVideoPath;
}

async function uploadToCloudinary(filePath: string) {
    console.log("\n[Cloudinary] Uploading...");
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET
    });

    const res = await cloudinary.uploader.upload(filePath, {
        resource_type: "video",
        public_id: `true_kova_eckhart_${Date.now()}`
    });
    console.log(`\n✅ UPLOAD SUCCESSFUL!\nURL: ${res.secure_url}\n`);
}

async function main() {
    console.log("Starting True Kova Workflow pipeline with Kling 3.0 & Fish Audio...");

    const act1Vid = await buildAct(
        "act1",
        "Meister Eckhart was a heretic. Why? Because he taught what Patanjali knew.",
        "Hyper-realistic cinematic shot of a medieval monk resembling Meister Eckhart meditating in a dark gothic church, lit by a single dramatic beam of light. Very realistic, photorealistic, 8k",
        [
            {text: "MEISTER ECKHART", color: "white"},
            {text: "WAS A HERETIC", color: "yellow"}
        ]
    );

    const act2Vid = await buildAct(
        "act2",
        "They both realized: The divine isn't in the sky. It's in the absolute silence of Nirodha.",
        "An ancient Indian yogi, Patanjali, in deep meditation in absolute darkness, with a subtle glowing aura. Photorealistic, mystical, high quality",
        [
            {text: "SILENCE OF", color: "white"},
            {text: "NIRODHA", color: "yellow"}
        ]
    );

    // Concat
    const concatList = path.join(TEMP_DIR, 'list.txt');
    fs.writeFileSync(concatList, `file '${act1Vid}'\nfile '${act2Vid}'\n`);
    const finalVideo = path.join(TEMP_DIR, 'final.mp4');
    
    console.log("\n[FFmpeg] Concatenating final video...");
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${finalVideo}" -loglevel error`);

    await uploadToCloudinary(finalVideo);
}

main().catch(err => {
    console.error("Pipeline Failed:", err);
    process.exit(1);
});
