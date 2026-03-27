import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import ffmpeg from 'fluent-ffmpeg';
import { FishAudioTtsClient } from './infrastructure/tts/FishAudioTtsClient';
import { RemotionVideoRenderer } from './infrastructure/video/RemotionVideoRenderer';
import { MediaStorageClient } from './infrastructure/storage/MediaStorageClient';
import { ReelManifest } from './domain/entities/ReelManifest';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY || "";
const EXCITED_VOICE_ID = "2fcfdf3229d94dc2bcb02b2c35405545"; // From user instruction
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

const PITCH_SLICES = [
    "Good afternoon. I am the founder of HoldSpace. We are building the infrastructure layer for the holistic wellness economy. We operate a SaaS-enabled marketplace that provides humans in acute emotional distress immediate access to verified healers. But more importantly, we provide the platform compliance and liability framework that makes this high risk market structurally safe and scalable.",
    "The current wellness market is chaotic. Seekers cannot verify practitioners, and marketplaces trying to solve this fail due to the leakage trap. Once a seeker finds a great somatic therapist online, their next session happens off platform. There is zero retention. Meanwhile, independent healers are drowning in complex compliance and liability risks that they cannot afford to manage alone.",
    "HoldSpace solves the leakage trap by giving practitioners the SaaS tools they actually need to run their business. Scheduling, payments, and embedded compliance. In exchange, seekers get a curated, insured marketplace. We facilitate every transaction in a legally compliant environment, eliminating the incentive for supply-side leakage.",
    "Our true moat is structural. We automate the massive burden of EU compliance. We then bundle this with platform exclusive group liability insurance. This is our supply side wedge. Once a practitioner onboards, leaving the platform means losing their legal protection and liability coverage. The switching cost is intentionally high.",
    "We deploy AI as a continuous risk underwriting engine. On the demand side, LLMs translate a seeker's raw emotional state into the correct healing modality, removing discovery friction. On the supply side, we use NLP to analyze post session feedback, actively detecting boundary violations or emotional volatility. This protects our insurance pool in real time.",
    "The consumer market for complementary and alternative medicine is over a trillion dollars globally. Millennials and Gen Z are driving a massive shift toward alternative care, yet the market remains completely fragmented and under digitized. We are providing the centralized, compliance first infrastructure required to safely aggregate this exploding consumer demand.",
    "Our revenue engine captures value from both the software and the transaction. We take a standard percentage based fee on every session booked. Additionally, practitioners pay a recurring monthly SaaS fee to access our advanced compliance and scheduling tools, and we offer premium marketplace visibility for practitioners who maintain pristine platform Trust Scores.",
    "Our initial Go To Market focuses on the Berlin wellness ecosystem. Berlin has an incredibly high density of both alternative practitioners and consumers seeking holistic support. We are utilizing a community led growth model, onboarding the city's most respected practitioners to drive organic seeker demand.",
    "We are not pitching a concept; the infrastructure is already built. Our MVP is fully live. We have engineered the end to end booking flows, integrated the payment architecture, and most importantly, operationalized the core regulatory and trust engines.",
    "We are not pitching for seed capital today. Our exclusive objective is network velocity. We are here to leverage the Soonami network to establish pilot corporate wellness programs across the Berlin tech ecosystem. We are pitching to Martin and Julian specifically because we want your mentorship on scaling B2B SaaS and utilizing compliance as a defensible moat. We have the infrastructure; we are here for the outreach."
];

const SCREENSHOT_NAMES = [
    "slide_1_home.png",
    "slide_2_leakage_healers.png",
    "slide_3_saas_tools.png",
    "slide_4_moat_compliance.png",
    "slide_5_ai_safety.png",
    "slide_6_b2c_market.png",
    "slide_7_revenue.png",
    "slide_8_gtm_berlin.png",
    "slide_9_mvp_traction.png",
    "slide_10_the_ask.png"
];

async function run() {
    try {
        console.log("== 1. Generating Segmented TTS Voiceover ==");
        const ttsClient = new FishAudioTtsClient(FISH_API_KEY, EXCITED_VOICE_ID);

        let segmentsData: any[] = [];
        let audioFiles: string[] = [];
        let totalTime = 0;

        for (let i = 0; i < PITCH_SLICES.length; i++) {
            console.log("Generating audio for slice " + (i + 1) + "...");
            const sliceStart = totalTime;
            const ttsResult = await ttsClient.synthesize(PITCH_SLICES[i]);

            const slicePath = path.join(process.cwd(), "tmp_audio_" + i + ".mp3");
            if (ttsResult.audioUrl.startsWith('data:')) {
                const b64 = ttsResult.audioUrl.split(',')[1];
                fs.writeFileSync(slicePath, Buffer.from(b64, 'base64'));
            } else {
                fs.copyFileSync(ttsResult.audioUrl, slicePath);
            }
            audioFiles.push(slicePath);

            const duration = ttsResult.durationSeconds;
            const sliceEnd = sliceStart + duration;
            totalTime += duration;

            // Resolve screenshot
            const screenPath = path.join('/tmp/screenshots', SCREENSHOT_NAMES[i]);
            let base64Image = "https://via.placeholder.com/1920x1080/000080/FFFFFF?text=Slide+" + (i + 1);
            try {
                if (fs.existsSync(screenPath)) {
                    const imgData = fs.readFileSync(screenPath, { encoding: 'base64' });
                    base64Image = "data:image/png;base64," + imgData;
                } else {
                    console.warn("Screenshot not found: " + screenPath);
                }
            } catch (err) { }

            segmentsData.push({
                start: sliceStart,
                end: sliceEnd,
                imageUrl: base64Image,
                zoomEffect: i % 2 === 0 ? "in" : "static",
                caption: ""
            });
        }

        console.log("== 2. Concatenating Audio ==");
        const mergedAudioPath = path.join(process.cwd(), 'merged_voiceover.mp3');
        await new Promise((resolve, reject) => {
            const command = ffmpeg();
            audioFiles.forEach(file => command.input(file));
            command
                .on('error', (err) => { console.error("FFMPEG error:", err); reject(err); })
                .on('end', () => { console.log('Merging finished !'); resolve(null); })
                .mergeToFile(mergedAudioPath, process.cwd());
        });

        const mergedBase64 = fs.readFileSync(mergedAudioPath, { encoding: 'base64' });
        const voiceoverUrl = "data:audio/mp3;base64," + mergedBase64;

        console.log("== 3. Fetching Kundalini Meditation Music ==");
        let musicUrl = "";
        try {
            const ambientPath = '/tmp/kundalini-music-v2/ambient.mp3';
            if (fs.existsSync(ambientPath)) {
                const mb64 = fs.readFileSync(ambientPath, 'base64');
                musicUrl = "data:audio/mp3;base64," + mb64;
                console.log("Fetched Kundalini meditation music.");
            } else {
                throw new Error("Kundalini music not found at " + ambientPath);
            }
        } catch (e: any) {
            console.log("Failed to fetch Kundalini music: ", e.message);
            // Fallback to local music if it fails
            const mb64 = fs.readFileSync(path.join(process.cwd(), 'background_music.mp3'), 'base64');
            musicUrl = "data:audio/mp3;base64," + mb64;
        }

        console.log("== 4. Creating Manifest & Rendering Video ==");
        const dummySrt = "1\\n00:00:00,000 --> " + new Date(totalTime * 1000).toISOString().substr(11, 12).replace('.', ',') + "\\n \\n\\n";
        const subtitlesUrl = "data:text/plain;base64," + Buffer.from(dummySrt).toString('base64');

        const manifest: ReelManifest = {
            voiceoverUrl: voiceoverUrl,
            subtitlesUrl: subtitlesUrl,
            musicUrl: musicUrl,
            durationSeconds: totalTime,
            segments: segmentsData,
            branding: { businessName: "HoldSpace" }
        };

        const renderer = new RemotionVideoRenderer();
        const renderResult = await renderer.render(manifest);
        console.log("Rendered successfully at " + renderResult.videoUrl);

        console.log("== 5. Uploading to Cloudinary ==");
        const storageClient = new MediaStorageClient(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET);

        const videoLocalPath = path.join(process.cwd(), 'public', renderResult.videoUrl);
        const uploadResult = await storageClient.uploadVideo(videoLocalPath, {
            folder: 'venturethon',
            publicId: "holdspace_pitch_v2_" + Date.now()
        });

        console.log("\\n\\n✅ FINAL V2 PITCH VIDEO CREATED");
        console.log("Cloudinary URL: " + uploadResult.url);

        // Cleanup tmp audio files
        audioFiles.forEach(f => { try { fs.unlinkSync(f); } catch (e) { } });
        try { fs.unlinkSync(mergedAudioPath); } catch (e) { }

    } catch (error) {
        console.error("Pipeline failed:", error);
    }
}

run();
