
const { MediaStorageClient } = require('../dist/infrastructure/storage/MediaStorageClient');
const { CloningTtsClient } = require('../dist/infrastructure/tts/CloningTtsClient');
const { TimelineVideoRenderer } = require('../dist/infrastructure/video/TimelineVideoRenderer');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load env
dotenv.config();

// Config
const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.CLOUDINARY_API_KEY;
const API_SECRET = process.env.CLOUDINARY_API_SECRET;
const FISH_KEY = process.env.FISH_AUDIO_API_KEY;
const VOICE_ID = process.env.FISH_AUDIO_VOICE_ID;
const SHOTSTACK_KEY = process.env.SHOTSTACK_API_KEY;

const NARRATION = "In the era of autonomous agents, reliability is the new security. Most agent ecosystems suffer from operational blindness—where agents drift, hallucinate, and fail without warning. Traditional monitoring relies on brittle logs and manual oversight, making it unscalable for true enterprise operations. Introducing the AgentOps Suite. A comprehensive infrastructure layer designed for trust, alignment, and observability. Our Agent Manager Dashboard provides a centralized command center. View agent lifecycles in our Kanban board, or deep-dive into chronological tasks with the Inbox view. Every agent is graded with our Trust Verifier, using Zero-Knowledge proofs to ensure secure credential handling. Need strict SLAs? Our Deadline Enforcer tracks agent heartbeats and enforces task timeouts in real-time. Communication is harmonized by the Semantic Aligner, while Convo Guard AI injects live safety guardrails. AgentOps Suite. Reliability by design. Deploy your future at agentops-suite.com.";

async function assemble() {
    console.log('🚀 Starting Meticulous Assembly...');

    const storage = new MediaStorageClient(CLOUD_NAME, API_KEY, API_SECRET);
    const tts = new CloningTtsClient(FISH_KEY, VOICE_ID);
    const renderer = new TimelineVideoRenderer(SHOTSTACK_KEY);

    // 1. Voiceover
    console.log('🎙️ Generating Voiceover...');
    const voiceResult = await tts.synthesize(NARRATION, { speed: 1.2 });
    console.log(`Voice Duration: ${voiceResult.durationSeconds}s`);

    const voiceUpload = await storage.uploadAudio(voiceResult.audioUrl, { folder: 'agentops/demo', publicId: 'narration' });
    const voiceUrl = voiceUpload.url;

    // 2. Upload Video Demo
    console.log('📹 Uploading UI Video...');
    const videoFile = './tmp/agent_manager_demo.webm';
    const videoUpload = await storage.uploadVideo(videoFile, { folder: 'agentops/demo', publicId: 'ui_recording' });
    const videoUrl = videoUpload.url;

    // 3. Upload AI Images
    console.log('🖼️ Uploading AI Images...');
    const images = [
        '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/agentops_intro_cinematic_1767834476759.png',
        '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/ai_drift_problem_1767834493066.png',
        '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/traditional_manual_logs_1767834507021.png',
        '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/agentops_suite_components_3d_1767834519218.png',
        '/Users/user1000/.gemini/antigravity/brain/b3a87094-99a6-4a45-b691-d6041582e539/agentops_outro_logo_premium_1767834533069.png'
    ];

    const imageUrls = [];
    for (let i = 0; i < images.length; i++) {
        const up = await storage.uploadImage(images[i], { folder: 'agentops/demo', publicId: `scene_${i}` });
        imageUrls.push(up.url);
    }

    // 4. Build Timeline
    // We have ~40-45s narration.
    const totalDuration = voiceResult.durationSeconds + 1; // plus offset

    const scenes = [
        { src: imageUrls[0], start: 0, length: 4 }, // Intro
        { src: imageUrls[1], start: 4, length: 6 }, // Problem
        { src: imageUrls[2], start: 10, length: 5 }, // Traditional
        { src: videoUrl, start: 15, length: 18, type: 'video' }, // UI Demo (detailed)
        { src: imageUrls[3], start: 33, length: 8 }, // Suite Components
        { src: imageUrls[4], start: 41, length: totalDuration - 41 } // Outro
    ];

    const timeline = {
        timeline: {
            background: "#000000",
            tracks: [
                // Video/Image Track
                {
                    clips: scenes.map(s => ({
                        asset: {
                            type: s.type || "image",
                            src: s.src
                        },
                        start: s.start,
                        length: s.length,
                        transition: { in: "fade", out: "fade" },
                        effect: s.type === 'video' ? undefined : "zoomIn",
                        fit: "contain"
                    }))
                },
                // Voiceover Track
                {
                    clips: [
                        {
                            asset: { type: "audio", src: voiceUrl },
                            start: 0,
                            length: voiceResult.durationSeconds
                        }
                    ]
                },
                // Music Track
                {
                    clips: [
                        {
                            asset: { type: "audio", src: "https://res.cloudinary.com/djol0rpn5/video/upload/v1767835006/agentops/demo/demo_music.mp3", volume: 0.2 },
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

    console.log('🎬 Submitting to Shotstack...');
    // We'll use the renderer's render method which accepts TimelineScriptPlan and RenderAssets
    // But since we built the full JSON, we might as well call the API directly or use the adapter correctly.
    // The renderer.render method expects (plan, assets). Let's map it.

    // Actually, I'll just use axios to post to Shotstack since I have the full JSON.
    const axios = require('axios');
    const response = await axios.post('https://api.shotstack.io/v1/render', timeline, {
        headers: { 'x-api-key': SHOTSTACK_KEY }
    });

    console.log('✅ Render Job Submitted!');
    console.log('Job ID:', response.data.response.id);
    console.log('Check status at: https://api.shotstack.io/v1/render/' + response.data.response.id);

    // Save job ID for checking
    fs.writeFileSync('tmp/render_job.txt', response.data.response.id);
}

assemble().catch(console.error);
