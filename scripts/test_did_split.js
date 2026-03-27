require('dotenv').config();
const Replicate = require('replicate');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const cloudinary = require('cloudinary').v2;

const REPLICATE_KEY = process.env.REPLICATE_API_TOKEN;
const DID_API_KEY = process.env.D_ID_API_KEY;
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function main() {
    const replicate = new Replicate({ auth: REPLICATE_KEY });
    
    console.log('1. FLUX single image');
    const prompt = "two philosophers sitting very close to each other at a small table, both facing camera. on the left a man with short red hair in red shirt, on the right a woman with long blue hair in blue dress. clear faces, clean graphic novel style, flat background. perfectly symmetric composition.";
    const out = await replicate.run('black-forest-labs/flux-schnell', {
        input: { prompt, aspect_ratio: "1:1", output_format: "png", seed: 15 }
    });
    const url = Array.isArray(out) ? out[0] : (out.url ? out.url() : out);
    
    const imgPath = '/tmp/shared_scene.png';
    const leftPath = '/tmp/left.png';
    const rightPath = '/tmp/right.png';
    
    const res = await axios.get(url, { responseType: 'stream' });
    const w = fs.createWriteStream(imgPath);
    res.data.pipe(w);
    await new Promise(r => w.on('finish', r));
    
    console.log('2. Splitting image');
    execSync(`ffmpeg -y -i ${imgPath} -filter:v "crop=iw/2:ih:0:0" ${leftPath} -loglevel warning`);
    execSync(`ffmpeg -y -i ${imgPath} -filter:v "crop=iw/2:ih:iw/2:0" ${rightPath} -loglevel warning`);
    
    console.log('3. Uploading left image to Cloudinary');
    const up = await cloudinary.uploader.upload(leftPath, { resource_type: 'image' });
    
    console.log('4. Calling D-ID check faces (or just Talks endpoint directly with short audio)');
    const authHeaders = {
        'Authorization': `Basic ${Buffer.from(DID_API_KEY).toString('base64')}`,
        'Content-Type': 'application/json'
    };
    
    const check = await axios.post('https://api.d-id.com/talks', {
        source_url: up.secure_url,
        script: { type: 'text', input: 'Testing one two' },
        config: { fluent: false, align_driver: true }
    }, { headers: authHeaders });
    
    console.log('D-ID Response:', check.data.id);
}
main().catch(e => console.error(e.response ? e.response.data : e.message));
