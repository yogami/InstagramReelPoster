require('dotenv').config({ path: '../../.env' });
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });

// Helper: download file from URL
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      response.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    }).on('error', (err) => {
      fs.unlink(dest, () => {}); 
      reject(err);
    });
  });
}

// Helper: convert local file to data URI for Replicate
function fileToDataUri(filePath) {
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1);
  const mime = ext === 'wav' ? 'audio/wav' : ext === 'png' ? 'image/png' : `image/${ext}`;
  return `data:${mime};base64,${data.toString('base64')}`;
}

// Each character turn: image + audio → animated video
const JOBS = [
  {
    name: "guy_line1",
    image: "public/guy_idle.png",
    audio: "public/guy_line1.wav",
    output: "public/guy_line1_animated.mp4"
  },
  {
    name: "girl_line1",
    image: "public/girl_idle.png",
    audio: "public/girl_line1.wav",
    output: "public/girl_line1_animated.mp4"
  },
  {
    name: "guy_line2",
    image: "public/guy_idle.png",
    audio: "public/guy_line2.wav",
    output: "public/guy_line2_animated.mp4"
  },
];

async function animateCharacter(job) {
  console.log(`\n🎬 Animating: ${job.name}`);
  console.log(`   Image: ${job.image}`);
  console.log(`   Audio: ${job.audio}`);

  const imageUri = fileToDataUri(job.image);
  const audioUri = fileToDataUri(job.audio);

  console.log(`   Calling SadTalker on Replicate...`);
  
  const output = await replicate.run(
    "cjwbw/sadtalker:a519cc0cfebaaeade068b23899165a11ec76aaa1d2b313d40d214f204ec957a3",
    {
      input: {
        source_image: imageUri,
        driven_audio: audioUri,
        still: true,           // Less head movement, more natural for illustrated chars
        preprocess: "crop",    // Crop to face
        enhancer: "gfpgan",    // Face enhancement
      }
    }
  );

  // Handle output: Replicate may return a URL string, a ReadableStream, or an object
  let videoUrl = output;
  if (typeof output !== 'string') {
    // If it's a ReadableStream or object, convert to string
    videoUrl = String(output);
    console.log(`   Output type: ${typeof output}, converted: ${videoUrl}`);
  }
  console.log(`   ✅ SadTalker returned URL: ${videoUrl}`);

  // Download the result using curl (most reliable)
  const outputPath = path.join(__dirname, job.output);
  const { execSync } = require('child_process');
  execSync(`curl -L -s -o "${outputPath}" "${videoUrl}"`);
  const fileSize = fs.statSync(outputPath).size;
  console.log(`   ✅ Saved animated video to: ${outputPath} (${(fileSize/1024).toFixed(1)}KB)`);
  
  return outputPath;
}

// Sleep helper
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log("=== Image-to-Video Animation Pipeline ===\n");
  console.log(`Using Replicate token: ${process.env.REPLICATE_API_TOKEN?.substring(0, 10)}...`);

  for (let i = 0; i < JOBS.length; i++) {
    const job = JOBS[i];
    if (i > 0) {
      console.log(`   ⏳ Waiting 15s to avoid rate limiting...`);
      await sleep(15000);
    }
    try {
      await animateCharacter(job);
    } catch (error) {
      console.error(`   ❌ FAILED for ${job.name}:`, error.message || error);
      // Log full error for debugging
      if (error.response) {
        console.error(`   Response status: ${error.response.status}`);
      }
    }
  }

  console.log("\n=== Animation Pipeline Complete ===");
}

main().catch(e => console.error("Fatal error:", e));
