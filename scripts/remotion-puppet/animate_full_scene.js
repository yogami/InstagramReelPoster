require('dotenv').config({ path: '../../.env' });
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const KIE_API_KEY = process.env.KIE_API_KEY;
const KIE_BASE_URL = process.env.KIE_API_BASE_URL || 'https://api.kie.ai/api/v1';

const SCENE_IMAGE_URL = 'https://res.cloudinary.com/djol0rpn5/image/upload/v1773703534/remotion_prototypes/beach_full_scene.jpg';

async function createVideoTask(prompt, duration) {
  console.log(`\n🎬 Creating video task...`);
  console.log(`   Prompt: "${prompt.substring(0, 80)}..."`);
  console.log(`   Duration: ${duration}s`);
  console.log(`   Model: kling-2.6/image-to-video`);
  
  const response = await axios.post(`${KIE_BASE_URL}/jobs/createTask`, {
    model: 'hailuo/2-3-image-to-video-standard',
    input: {
      prompt: prompt,
      image_url: SCENE_IMAGE_URL,
      duration: String(duration),
      resolution: '768P',
    }
  }, {
    headers: {
      'Authorization': `Bearer ${KIE_API_KEY}`,
      'Content-Type': 'application/json',
    }
  });

  console.log(`   ✅ Task created:`, JSON.stringify(response.data, null, 2));
  return response.data;
}

async function queryTaskStatus(taskId) {
  const response = await axios.get(`${KIE_BASE_URL}/jobs/recordInfo`, {
    params: { taskId },
    headers: {
      'Authorization': `Bearer ${KIE_API_KEY}`,
    }
  });
  return response.data;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitForCompletion(taskId, maxMinutes = 10) {
  console.log(`   ⏳ Polling task ${taskId}...`);
  const maxAttempts = maxMinutes * 6; // check every 10s
  
  for (let i = 0; i < maxAttempts; i++) {
    await sleep(10000);
    const status = await queryTaskStatus(taskId);
    const state = status.data?.status || status.status || 'unknown';
    console.log(`   [${i+1}] Status: ${state}`);
    
    if (state === 'success' || state === 'completed' || state === 'done') {
      console.log(`   ✅ Task completed!`);
      console.log(`   Full response:`, JSON.stringify(status, null, 2));
      return status;
    }
    
    if (state === 'failed' || state === 'error') {
      console.error(`   ❌ Task failed:`, JSON.stringify(status, null, 2));
      throw new Error(`Task failed: ${JSON.stringify(status)}`);
    }
  }
  
  throw new Error(`Task timed out after ${maxMinutes} minutes`);
}

async function main() {
  console.log("=== Full Scene Animation via Kie.ai ===\n");
  console.log(`API Key: ${KIE_API_KEY?.substring(0, 10)}...`);
  console.log(`Base URL: ${KIE_BASE_URL}`);
  console.log(`Scene Image: ${SCENE_IMAGE_URL}`);

  // Generate a 10-second animated clip of the full scene
  const prompt = `A beautiful animated beach scene at golden hour. The ocean waves gently lap against the white sand shore. Palm tree leaves sway softly in the warm tropical breeze. A young man sitting on the sand plays an acoustic guitar with gentle strumming motions, his body swaying slightly to the music. A young woman in a hammock rocks gently, her hair flowing in the breeze. Warm golden light, soft watercolor animation style, gentle ambient movement throughout the entire scene. Subtle camera movement.`;

  try {
    const taskResult = await createVideoTask(prompt, 10);
    
    // Extract task ID — handle various response formats
    const taskId = taskResult.data?.taskId || taskResult.taskId || taskResult.data?.id || taskResult.id;
    
    if (!taskId) {
      console.log("Full response:", JSON.stringify(taskResult, null, 2));
      console.error("❌ Could not extract taskId from response");
      return;
    }

    console.log(`\n   Task ID: ${taskId}`);
    
    // Poll until done
    const result = await waitForCompletion(taskId);
    
    // Extract video URL from result
    // Parse resultJson which contains the video URL
    let videoUrl = null;
    if (result.data?.resultJson) {
      try {
        const resultData = JSON.parse(result.data.resultJson);
        videoUrl = resultData.resultUrls?.[0];
      } catch (e) {}
    }
    videoUrl = videoUrl || result.data?.output?.video_url || result.data?.video_url;
    
    if (videoUrl) {
      const outputPath = path.join(__dirname, 'public', 'scene_animated.mp4');
      console.log(`\n   Downloading: ${videoUrl}`);
      execSync(`curl -L -s -o "${outputPath}" "${videoUrl}"`);
      const size = fs.statSync(outputPath).size;
      console.log(`   ✅ Saved: ${outputPath} (${(size/1024/1024).toFixed(1)}MB)`);
    } else {
      console.log("   ⚠️  No video URL found in result. Full result:");
      console.log(JSON.stringify(result, null, 2));
    }
    
  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
  }
}

main();
