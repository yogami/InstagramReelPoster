import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
import { FishAudioTtsClient } from '../src/infrastructure/tts/FishAudioTtsClient';
import Replicate from 'replicate';

dotenv.config();

const FISH_VOICE_ID = process.env.FISH_AUDIO_VOICE_ID || "716594c03801446bb87a964a1c2a5895";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME!;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY!;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET!;
const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN!;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL || "https://hook.eu2.make.com/o55ndmi2ncxnmxlxk7txibyemtifpjwi";
const MAKE_API_KEY = "4LyPD8E3TVRmh_F"; // From validated test script

const TEMP_DIR = '/tmp/kova_mystics_pipeline';
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

const replicate = new Replicate({
    auth: REPLICATE_API_TOKEN,
});

async function generateVideo(prompt: string): Promise<string> {
    console.log(`[Replicate] Generating FLUX image for: ${prompt} ...`);
    const output: any = await replicate.run("black-forest-labs/flux-schnell", {
        input: {
            prompt: prompt + ", vertical aspect ratio 9:16, cinematic lighting, photorealistic, 8k resolution, highly detailed",
            aspect_ratio: "9:16",
            output_format: "png",
            output_quality: 100
        }
    });

    console.log("[Replicate] output:", output);
    if (Array.isArray(output) && output.length > 0) return output[0];
    if (typeof output === 'string') return output;
    
    if(output && output.url()) {
        return output.url();
    }
    
    if (output && typeof output.toString === 'function' && output.toString().startsWith('http')) {
        return output.toString();
    }

    throw new Error(`Failed to parse FLUX output: ${JSON.stringify(output)}`);
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

    // 2. Generate Video via Replicate
    let videoUrl = "";
    try {
        videoUrl = await generateVideo(videoPrompt);
        if(!videoUrl) throw new Error("No URL returned from FLUX");
    } catch(err: any) {
        console.warn("[Replicate] FLUX failed...", err.message);
        throw err;
    }
    
    const rawVideoPath = path.join(TEMP_DIR, `${actId}_raw.mp4`);
    console.log(`[Replicate] Downloading video from ${videoUrl}...`);
    await downloadFile(videoUrl, rawVideoPath);

    // 3. Composite with FFmpeg (Kova Typography Overlay)
    const finalVideoPath = path.join(TEMP_DIR, `${actId}_final.mp4`);
    console.log(`[FFmpeg] Compositing...`);
    
    let drawtext = "";
    words.forEach((w, index) => {
        const yOffset = (index - words.length/2) * 120;
        drawtext += `drawtext=text='${w.text}':fontcolor=${w.color}:fontsize=90:fontfile=/System/Library/Fonts/Impact.ttf:x=(w-text_w)/2:y=(h-text_h)/2+${yOffset}:shadowcolor=black:shadowx=4:shadowy=4,`;
    });
    if (drawtext.length > 0) {
         drawtext = drawtext.slice(0, -1);
    }

    const zoompan = `zoompan=z='min(zoom+0.0015,1.5)':d=${Math.ceil(dur*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`;

    const filterComplex = drawtext 
        ? `-vf "scale=1080.0:1920.0,${zoompan},${drawtext.replace(/fontfile=[^:]+:/, '')}"`
        : `-vf "scale=1080.0:1920.0,${zoompan}"`;

    const cmd = `ffmpeg -y -loop 1 -i "${rawVideoPath}" -i "${audioPath}" ` +
                `${filterComplex} ` + 
                `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t ${dur} "${finalVideoPath}" -loglevel error`;

    execSync(cmd);
    return finalVideoPath;
}

async function uploadToCloudinary(filePath: string): Promise<string> {
    console.log("\n[Cloudinary] Uploading...");
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
        cloud_name: CLOUDINARY_CLOUD_NAME,
        api_key: CLOUDINARY_API_KEY,
        api_secret: CLOUDINARY_API_SECRET
    });

    const res = await cloudinary.uploader.upload(filePath, {
        resource_type: "video",
        public_id: `mystics_video_${Date.now()}`
    });
    console.log(`\n✅ UPLOAD SUCCESSFUL!\nURL: ${res.secure_url}\n`);
    return res.secure_url;
}

async function publishToInstagram(videoUrl: string) {
    console.log("\n[Make.com] Publishing to Instagram...");
    const payload = {
        jobId: `mystics_video_${Date.now()}`,
        status: 'completed',
        caption: 'Christian Mystics and Eastern Yogis experienced the exact same Non-Dual Reality. All paths lead to the same state. 👁️ \n\n#nonduality #mysticism #meistereckhart #patanjali #spiritualawakening',
        video_url: videoUrl,
        url: videoUrl,
        videoUrl: videoUrl, // Make sure all aliases are hit
        metadata: {
            duration: 60,
            createdAt: new Date(),
            completedAt: new Date(),
            test: false
        }
    };

    try {
        const response = await axios.post(MAKE_WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-make-apikey': MAKE_API_KEY
            }
        });
        console.log(`✅ Webhook sent! Status: ${response.status}`);
        console.log('Response:', response.data);
    } catch (error: any) {
        console.error('❌ Failed to trigger webhook:', error.message);
        if (error.response) {
            console.error('Data:', error.response.status, error.response.data);
        }
        throw error;
    }
}

async function main() {
    console.log("Starting Mysticism Video Pipeline...");

    try {
        const act1Vid = await buildAct(
            "act1",
            "Meister Eckhart was called a heretic in the West. ... Why? ... Because he said exactly what Patanjali was saying in the East.",
            "Hyper-realistic cinematic shot of a medieval monk resembling Meister Eckhart meditating in a dark gothic church, lit by a single dramatic beam of light. A mystical, serene atmosphere. Photorealistic, 8k",
            [
                {text: "WESTERN HERETIC", color: "white"},
                {text: "EASTERN YOGI", color: "yellow"}
            ]
        );

        console.log("Waiting 7 seconds for Replicate rate limits...");
        await new Promise(r => setTimeout(r, 7000));

        const act2Vid = await buildAct(
            "act2",
            "St. John of the Cross, spoke of the Dark Night of the Soul. ... Stripping away the ego, to find absolute nothingness. ... In the East, they call it the Void, or Shunyata.",
            "A 16th century Spanish mystic, St. John of the Cross, walking through an endless desert at night under a starless sky. Photorealistic, dark, deeply atmospheric, cinematic",
            [
                {text: "DARK NIGHT", color: "white"},
                {text: "THE VOID", color: "yellow"}
            ]
        );

        console.log("Waiting 7 seconds for Replicate rate limits...");
        await new Promise(r => setTimeout(r, 7000));

        const act3Vid = await buildAct(
            "act3",
            "St. Teresa of Avila, wrote about the Interior Castle. ... Finding God, in the deepest center of the self. ... Indian yogis call this, the Lotus Heart.",
            "A beautiful cloistered nun from the 16th century, glowing from within while in profound deep ecstatic prayer inside a dark stone room. Photorealistic, ethereal, cinematic 8k",
            [
                {text: "INTERIOR CASTLE", color: "white"},
                {text: "LOTUS HEART", color: "yellow"}
            ]
        );

        console.log("Waiting 7 seconds for Replicate rate limits...");
        await new Promise(r => setTimeout(r, 7000));

        const act4Vid = await buildAct(
            "act4",
            "Two completely different worlds. ... Two completely different religions. ... Arriving at the exact same conclusion. ... ",
            "A cinematic split-screen conceptual image blending a Gothic European cathedral archway with an ancient Indian stone temple. Mystical mist, profound atmosphere. Photorealistic, 8k",
            [
                {text: "SAME", color: "white"},
                {text: "CONCLUSION", color: "yellow"}
            ]
        );

        console.log("Waiting 7 seconds for Replicate rate limits...");
        await new Promise(r => setTimeout(r, 7000));

        const act5Vid = await buildAct(
            "act5",
            "Communion with God in the West, ... is Satchitananda in the East. ... The truth is non-dual. ... All paths, lead to the exact same state.",
            "A magnificent abstract representation of consciousness uniting. A burst of golden transcendent light emerging from absolute darkness. Cinematic, sublime. 8k",
            [
                {text: "ALL PATHS", color: "white"},
                {text: "MERGE", color: "yellow"}
            ]
        );

        // Concat
        const concatList = path.join(TEMP_DIR, 'list.txt');
        fs.writeFileSync(concatList, `file '${act1Vid}'\nfile '${act2Vid}'\nfile '${act3Vid}'\nfile '${act4Vid}'\nfile '${act5Vid}'\n`);
        const finalVideo = path.join(TEMP_DIR, 'final.mp4');
        
        console.log("\n[FFmpeg] Concatenating final video...");
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${finalVideo}" -loglevel error`);

        const publishedUrl = await uploadToCloudinary(finalVideo);
        
        await publishToInstagram(publishedUrl);
        
        console.log("\n🎉 Full Pipeline Completed Successfully!");
        
    } catch (err: any) {
        console.error("Pipeline Failed:", err);
        process.exit(1);
    }
}

main();
