import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
import { FishAudioTtsClient } from './infrastructure/tts/FishAudioTtsClient';
import { RemotionVideoRenderer } from './infrastructure/video/RemotionVideoRenderer';
import { MediaStorageClient } from './infrastructure/storage/MediaStorageClient';
import { ReelManifest } from './domain/entities/ReelManifest';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const FISH_API_KEY = process.env.FISH_AUDIO_API_KEY || "";
const VOICE_ID = "716594c03801446bb87a964a1c2a5895";
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || "";
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || "";
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || "";

const PITCH_TEXT = `Good afternoon. I am the founder of HoldSpace. We are building the infrastructure layer for the holistic wellness economy. We operate a SaaS-enabled marketplace that provides humans in acute emotional distress immediate access to verified healers. But more importantly, we provide the platform compliance and liability framework that makes this high risk market structurally safe and scalable.
The current wellness market is chaotic. Seekers cannot verify practitioners, and marketplaces trying to solve this fail due to the leakage trap. Once a seeker finds a great somatic therapist online, their next session happens off platform. There is zero retention. Meanwhile, independent healers are drowning in complex compliance and liability risks that they cannot afford to manage alone.
HoldSpace solves the leakage trap by giving practitioners the SaaS tools they actually need to run their business. Scheduling, payments, and embedded compliance. In exchange, seekers get a curated, insured marketplace. We facilitate every transaction in a legally compliant environment, eliminating the incentive for supply-side leakage.
Our true moat is structural. We automate the massive burden of EU compliance. We then bundle this with platform exclusive group liability insurance. This is our supply side wedge. Once a practitioner onboards, leaving the platform means losing their legal protection and liability coverage. The switching cost is intentionally high.
We deploy AI as a continuous risk underwriting engine. On the demand side, LLMs translate a seeker's raw emotional state into the correct healing modality, removing discovery friction. On the supply side, we use NLP to analyze post session feedback, actively detecting boundary violations or emotional volatility. This protects our insurance pool in real time.
The consumer market for complementary and alternative medicine is over a trillion dollars globally. Millennials and Gen Z are driving a massive shift toward alternative care, yet the market remains completely fragmented and under digitized. We are providing the centralized, compliance first infrastructure required to safely aggregate this exploding consumer demand.
Our revenue engine captures value from both the software and the transaction. We take a standard percentage based fee on every session booked. Additionally, practitioners pay a recurring monthly SaaS fee to access our advanced compliance and scheduling tools, and we offer premium marketplace visibility for practitioners who maintain pristine platform Trust Scores.
Our initial Go To Market focuses on the Berlin wellness ecosystem. Berlin has an incredibly high density of both alternative practitioners and consumers seeking holistic support. We are utilizing a community led growth model, onboarding the city's most respected practitioners to drive organic seeker demand.
We are not pitching a concept; the infrastructure is already built. Our MVP is fully live. We have engineered the end to end booking flows, integrated the payment architecture, and most importantly, operationalized the core regulatory and trust engines.
We are not pitching for seed capital today. Our exclusive objective is network velocity. We are here to leverage the Soonami network to establish pilot corporate wellness programs across the Berlin tech ecosystem. We are pitching to Martin and Julian specifically because we want your mentorship on scaling B2B SaaS and utilizing compliance as a defensible moat. We have the infrastructure; we are here for the outreach.`;

const IMAGE_PROMPTS = [
    "A clean, minimalist logo mark for a modern wellness tech company. Deep navy blue, crisp white, terracotta accents. Professional incubator-ready aesthetics.",
    "A chaotic abstract representation of people drifting apart. Minimalist vector art, deep blue and terracotta, showing broken connections.",
    "A structured, connected network node graphic. Crisp white background, navy blue connecting lines, organized and clean.",
    "A protective shield or vault icon integrated with subtle organic curves. Tech-focused but human-centric, flat vector.",
    "Abstract glowing AI brain or nodes analyzing data streams. Clean corporate saas graphics, navy and bright white.",
    "Global network map showing explosive growth and connections, styled as a modern SaaS dashboard widget.",
    "A clean dashboard mockup showing recurring revenue ascending charts and trust scores. Minimalist SaaS design.",
    "A minimalist map of Berlin with glowing connection points, illustrating community growth. Flat vector, navy and terracotta.",
    "A sleek smartphone interface displaying a seamless booking flow for wellness sessions. High fidelity UI mockup.",
    "A handshake icon stylized in a modern tech aesthetic. Symbolizing partnership and corporate pilot outreach."
];

async function run() {
    try {
        console.log("== 1. Generating TTS Voiceover ==");
        const ttsClient = new FishAudioTtsClient(FISH_API_KEY, VOICE_ID);
        const ttsResult = await ttsClient.synthesize(PITCH_TEXT);
        console.log("Received TTS result: duration " + ttsResult.durationSeconds + "s");

        // Calculate chunk timings manually since we don't have exact word timing
        const totalDuration = ttsResult.durationSeconds;
        const segmentDuration = totalDuration / IMAGE_PROMPTS.length;

        console.log("== 2. Generating " + IMAGE_PROMPTS.length + " Images ==");
        const { GoogleImageClient } = require('./infrastructure/images/GoogleImageClient');
        const imgClient = new GoogleImageClient(""); // Uses gcloud locally

        const segments: any[] = [];
        let currentTime = 0;

        for (let i = 0; i < IMAGE_PROMPTS.length; i++) {
            console.log("Generating Image " + (i + 1) + "...");
            // Add error handling around endpoints
            let imageRes: any;
            try {
                imageRes = await imgClient.generateImage(IMAGE_PROMPTS[i], {
                    aspectRatio: '16:9',
                    style: 'digital-art'
                });
                console.log("Image " + (i + 1) + " generated: " + imageRes.imageUrl.substring(0, 50) + "...");
            } catch (imgErr) {
                console.warn("Image " + (i + 1) + " failed, using fallback URL. ERROR: ", imgErr);
                // Fallback dummy image if generation fails
                imageRes = { imageUrl: "https://via.placeholder.com/1920x1080/000080/FFFFFF?text=Slide+" + (i + 1) };
            }
            let base64Image = "";
            try {
                const imgData = fs.readFileSync(imageRes.imageUrl, { encoding: 'base64' });
                base64Image = "data:image/png;base64," + imgData;
                console.log("Image " + (i + 1) + " base64 generated.");
            } catch (err) {
                console.warn("Failed to read generated image, using fallback URL.");
                base64Image = "https://via.placeholder.com/1920x1080/000080/FFFFFF?text=Slide+" + (i + 1);
            }

            segments.push({
                start: currentTime,
                end: currentTime + segmentDuration,
                imageUrl: base64Image,
                zoomEffect: i % 2 === 0 ? "in" : "out",
                caption: ""
            });
            currentTime += segmentDuration;
        }

        console.log("== 3. Creating Dummy SRT Subtitles ==");
        // Since we don't have deepgram available in this simple script, we'll make a dummy empty SRT
        const dummySrt = "1\\n00:00:00,000 --> " + new Date(totalDuration * 1000).toISOString().substr(11, 12).replace('.', ',') + "\\n \\n\\n";
        const subtitlesUrl = "data:text/plain;base64," + Buffer.from(dummySrt).toString('base64');

        console.log("== 4. Creating Manifest & Rendering Video ==");
        const musicPath = path.join(process.cwd(), 'background_music.mp3');
        const musicBase64 = fs.readFileSync(musicPath, { encoding: 'base64' });
        const manifest: ReelManifest = {
            voiceoverUrl: ttsResult.audioUrl,
            subtitlesUrl: subtitlesUrl,
            musicUrl: "data:audio/mp3;base64," + musicBase64,
            durationSeconds: totalDuration,
            segments: segments,
            branding: {
                businessName: "HoldSpace"
            }
        };

        const renderer = new RemotionVideoRenderer();
        const renderResult = await renderer.render(manifest);
        console.log("Rendered successfully at " + renderResult.videoUrl);

        console.log("== 5. Uploading to Cloudinary ==");
        const storageClient = new MediaStorageClient(CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET);

        const videoLocalPath = path.join(process.cwd(), 'public', renderResult.videoUrl);
        const uploadResult = await storageClient.uploadVideo(videoLocalPath, {
            folder: 'venturethon',
            publicId: "holdspace_pitch_" + Date.now()
        });

        console.log("\\n\\n✅ FULL PITCH VIDEO CREATED SUCCESSFULLY");
        console.log("Cloudinary URL: " + uploadResult.url);
        fs.writeFileSync(path.join(process.cwd(), 'pitch_video_url.txt'), uploadResult.url);

    } catch (error) {
        console.error("Pipeline failed:", error);
    }
}

run();
