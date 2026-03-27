
const { MediaStorageClient } = require('../dist/infrastructure/storage/MediaStorageClient');
const { CloningTtsClient } = require('../dist/infrastructure/tts/CloningTtsClient');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FISH_KEY = process.env.FISH_AUDIO_API_KEY;
const VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const SHOTSTACK_KEY = process.env.SHOTSTACK_API_KEY;

const NARRATION = "Enterprises are deploying thousands of AI agents, but traditional monitoring is blind. Drifting logic, missed deadlines, and unverified identities create catastrophic risk. You cannot manage a thousand autonomous agents with spreadsheet logs. This is the AgentOps Suite. The first infrastructure layer designed not just to run agents, but to Verify, Govern, and Secure them. It starts with the Trust Verifier. We assign every agent a decentralized identity. If an agent lacks a verified credential, it doesn't touch your data. Period. For regulated domains like Healthcare, ConvoGuard AI sits in the loop. It filters hazardous advice in real-time, ensuring strict clinical compliance before any user sees a response. And with our Deadline Enforcer, you monitor the heartbeat of every task. Every SLA is tracked, guaranteeing your ecosystem runs on time, every time. Manage it all from our centralized Agent Manager. Full Observability. Reliability by Design. Deploy your future at agentops-suite.com.";

async function assemble() {
    console.log('🚀 Starting Meticulous Assembly V2...');

    // Uploads
    const storage = new MediaStorageClient(CLOUD_NAME, API_KEY, API_SECRET);
    const tts = new CloningTtsClient(FISH_KEY, VOICE_ID);

    console.log('🎙️ Generating Voiceover...');
    const voiceResult = await tts.synthesize(NARRATION, { speed: 1.25 });
    console.log(`Voice Duration: ${voiceResult.durationSeconds}s`);

    const totalDuration = voiceResult.durationSeconds + 3;
    const voiceUpload = await storage.uploadAudio(voiceResult.audioUrl, { folder: 'agentops/demo', publicId: 'narration_v2' });
    const voiceUrl = voiceUpload.url;

    console.log('📹 Uploading UI Video V2...');
    const videoFile = './tmp/agent_manager_demo_v2.webm';
    if (!fs.existsSync(videoFile)) throw new Error("V2 Video not found!");
    const videoUpload = await storage.uploadVideo(videoFile, { folder: 'agentops/demo', publicId: 'ui_recording_v2' });
    const videoUrl = videoUpload.url;

    const images = {
        chaos: '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/enterprise_chaos_network_1767859483421.png',
        drift: '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/ai_drift_problem_1767834493066.png',
        manual: '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/traditional_manual_logs_1767834507021.png',
        components: '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/agentops_suite_components_3d_1767834519218.png',
        outro: '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/agentops_outro_logo_premium_1767834533069.png'
    };

    console.log('🖼️ Uploading Images...');
    const urls = {};
    for (const [key, path] of Object.entries(images)) {
        if (!fs.existsSync(path)) { console.warn(`Warning: ${path} missing, skipping`); continue; }
        const up = await storage.uploadImage(path, { folder: 'agentops/demo', publicId: `v2_${key}` });
        urls[key] = up.url;
    }

    // Timeline
    // 00-05: Chaos
    // 05-09: Manual
    // 09-14: Components
    // 14-41: UI Video
    // 41-End: Outro

    const scenes = [
        { src: urls.chaos, start: 0, length: 5, effect: 'zoomIn' },
        { src: urls.manual, start: 5, length: 4, effect: 'zoomIn' },
        { src: urls.components, start: 9, length: 5, effect: 'zoomIn' },
        { src: videoUrl, start: 14, length: 27, type: 'video' },
        { src: urls.outro, start: 41, length: totalDuration - 41, effect: 'zoomIn' }
    ];

    const timeline = {
        timeline: {
            background: "#000000",
            tracks: [
                {
                    clips: scenes.map(s => ({
                        asset: {
                            type: s.type || "image",
                            src: s.src
                        },
                        start: s.start,
                        length: s.length,
                        transition: { in: "fade", out: "fade" },
                        effect: s.type === 'video' ? undefined : s.effect,
                        fit: "contain",
                        scale: s.type === 'video' ? 1.0 : undefined
                    }))
                },
                {
                    clips: [
                        { asset: { type: "audio", src: voiceUrl }, start: 0, length: voiceResult.durationSeconds }
                    ]
                },
                {
                    clips: [
                        {
                            asset: {
                                type: "audio",
                                src: "https://res.cloudinary.com/djol0rpn5/video/upload/v1767835006/agentops/demo/demo_music.mp3",
                                volume: 0.08,
                                effect: "fadeOut"
                            },
                            start: 0,
                            length: totalDuration
                        }
                    ]
                }
            ]
        },
        output: {
            format: "mp4",
            resolution: "1080",
            aspectRatio: "9:16",
            fps: 30
        }
    };

    console.log('🎬 Submitting V2 to Shotstack...');
    try {
        const response = await axios.post('https://api.shotstack.io/v1/render', timeline, {
            headers: { 'x-api-key': SHOTSTACK_KEY }
        });
        console.log('✅ Render Job Submitted!');
        console.log('Job ID:', response.data.response.id);
        fs.writeFileSync('tmp/render_job.txt', response.data.response.id);
    } catch (error) {
        if (error.response) {
            console.error('❌ Shotstack Error:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('❌ Assembly Error:', error);
        }
    }
}

assemble().catch(console.error);
