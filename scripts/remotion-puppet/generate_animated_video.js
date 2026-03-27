#!/usr/bin/env node
/**
 * Automated Video Animation Pipeline
 * 
 * Finds the correct Veo/Kling model on kie.ai, generates lip-synced video,
 * polls for completion, and downloads the result.
 * 
 * Usage: node generate_animated_video.js
 */
require('dotenv').config({ path: '../../.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const API_KEY = process.env.KIE_API_KEY;
const BASE_URL = process.env.KIE_API_BASE_URL || 'https://api.kie.ai/api/v1';
const SCENE_IMAGE = 'https://res.cloudinary.com/djol0rpn5/image/upload/v1773703534/remotion_prototypes/beach_full_scene.jpg';

const AUDIO_URLS = {
  guy_line1: 'https://res.cloudinary.com/djol0rpn5/video/upload/v1773743296/remotion_prototypes/guy_line1.wav',
  girl_line1: 'https://res.cloudinary.com/djol0rpn5/video/upload/v1773743297/remotion_prototypes/girl_line1.wav',
  guy_line2: 'https://res.cloudinary.com/djol0rpn5/video/upload/v1773743298/remotion_prototypes/guy_line2.wav',
};

const PROMPTS = {
  guy_line1: "A young man with brown hair playing guitar speaks on a tropical beach at golden hour: You know what I love about this place? No deadlines. No emails. Just the waves.",
  girl_line1: "A young woman with dark hair in a hammock speaks on a tropical beach at golden hour: Mmm. I could stay here forever. Play me that song again, the one from last night.",
  guy_line2: "A young man with brown hair playing guitar speaks on a tropical beach at golden hour: This one? I actually wrote it this morning. Inspired by the sunrise.",
};

// Step 1: Discover the correct model name
const AVATAR_MODELS_TO_TRY = [
  'kling/ai-avatar-standard',
  'veo/3-1-image-to-video',
  'google/veo-3-1-image-to-video',
  'google-veo-3.1/image-to-video',
  'veo-3.1/image-to-video',
  'google/veo-3.1',
  'veo/3-1',
  'veo-3-1/image-to-video',
  'google-veo/3-1-image-to-video',
  'google-veo-3-1/image-to-video',
  'veo3.1/image-to-video',
  'veo-3.1/text-to-video',
];

const LIPSYNC_MODELS_TO_TRY = [
  'kling/ai-avatar-standard',
  'kling/ai-avatar-pro',
  'infinitalk/from-audio',
];

async function tryCreateTask(model, input) {
  try {
    const r = await axios.post(`${BASE_URL}/jobs/createTask`, { model, input }, {
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    return r.data;
  } catch (e) {
    if (e.response) return e.response.data;
    return { code: -1, msg: e.message };
  }
}

async function findWorkingModel(models, testInput) {
  console.log(`\n🔍 Testing ${models.length} model names...`);
  for (const model of models) {
    const result = await tryCreateTask(model, testInput);
    const code = result.code || result.status;
    const msg = (result.msg || '').substring(0, 50);
    console.log(`   ${model} -> ${code} (${msg})`);
    
    if (code === 200) {
      console.log(`   ✅ FOUND WORKING MODEL: ${model}`);
      return { model, taskId: result.data?.taskId };
    }
    if (code !== 422) {
      // Not "unsupported model" — could be a field issue (500) or credit issue (402)
      console.log(`   ⚠️  Model exists but returned ${code}: ${msg}`);
    }
  }
  return null;
}

async function pollTask(taskId, maxMinutes = 15) {
  console.log(`   ⏳ Polling task ${taskId}...`);
  const maxAttempts = maxMinutes * 4; // check every 15s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise(r => setTimeout(r, 15000));
    try {
      const r = await axios.get(`${BASE_URL}/jobs/recordInfo`, {
        params: { taskId },
        headers: { 'Authorization': `Bearer ${API_KEY}` },
        timeout: 10000,
      });
      const state = r.data?.data?.state;
      process.stdout.write(`   [${i + 1}/${maxAttempts}] ${state}\r`);
      
      if (state === 'success') {
        console.log(`\n   ✅ Task completed!`);
        const resultJson = r.data.data.resultJson;
        if (resultJson) {
          const parsed = JSON.parse(resultJson);
          return parsed.resultUrls?.[0];
        }
        return null;
      }
      if (state === 'fail') {
        console.log(`\n   ❌ Task failed: ${r.data.data.failMsg}`);
        return null;
      }
    } catch (e) {
      console.log(`   [${i + 1}] Poll error: ${e.message}`);
    }
  }
  console.log(`\n   ⏰ Timed out after ${maxMinutes} minutes`);
  return null;
}

async function downloadVideo(url, outputPath) {
  console.log(`   📥 Downloading: ${url.substring(0, 60)}...`);
  execSync(`curl -L -s -o "${outputPath}" "${url}"`);
  const size = fs.statSync(outputPath).size;
  console.log(`   ✅ Saved: ${outputPath} (${(size / 1024 / 1024).toFixed(1)}MB)`);
  return outputPath;
}

async function main() {
  console.log('=== Animated Video Generation Pipeline ===\n');
  console.log(`API Key: ${API_KEY?.substring(0, 10)}...`);
  console.log(`Image: ${SCENE_IMAGE}`);

  // Step 1: Find a working lip-sync model  
  console.log('\n--- Step 1: Finding working lip-sync model ---');
  const lipsyncResult = await findWorkingModel(LIPSYNC_MODELS_TO_TRY, {
    image_url: SCENE_IMAGE,
    audio_url: AUDIO_URLS.guy_line1,
    prompt: PROMPTS.guy_line1,
  });

  if (lipsyncResult?.taskId) {
    console.log(`\n--- Step 2: Waiting for test video (${lipsyncResult.model}) ---`);
    const videoUrl = await pollTask(lipsyncResult.taskId);
    if (videoUrl) {
      const outPath = path.join(__dirname, 'public', 'guy_line1_lipsync.mp4');
      await downloadVideo(videoUrl, outPath);
      console.log(`\n🎉 SUCCESS! Lip-synced video saved to: ${outPath}`);
      console.log(`   Model: ${lipsyncResult.model}`);
      return;
    }
  }

  // Step 2: If lip-sync models fail, try Veo for full scene
  console.log('\n--- Fallback: Trying Veo models for full scene generation ---');
  const veoResult = await findWorkingModel(AVATAR_MODELS_TO_TRY, {
    prompt: PROMPTS.guy_line1,
    image_url: SCENE_IMAGE,
    duration: '8',
    sound: true,
  });

  if (veoResult?.taskId) {
    console.log(`\n--- Waiting for Veo video (${veoResult.model}) ---`);
    const videoUrl = await pollTask(veoResult.taskId);
    if (videoUrl) {
      const outPath = path.join(__dirname, 'public', 'scene_veo.mp4');
      await downloadVideo(videoUrl, outPath);
      console.log(`\n🎉 SUCCESS! Veo video saved to: ${outPath}`);
      console.log(`   Model: ${veoResult.model}`);
      return;
    }
  }

  console.log('\n❌ No working model found. Check your kie.ai credits and model availability.');
  console.log('   Visit https://kie.ai/pricing (filter by Video) to see available models.');
}

main().catch(e => console.error('Fatal:', e.message));
