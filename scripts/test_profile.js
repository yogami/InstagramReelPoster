require('dotenv').config();
const Replicate = require('replicate');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

const REPLICATE_KEY  = process.env.REPLICATE_API_TOKEN;
const replicate = new Replicate({ auth: REPLICATE_KEY });

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function run() {
    console.log('1. Generating 3/4 profile image...');
    const outImg = await replicate.run('black-forest-labs/flux-schnell', {
        input: {
            prompt: "male philosopher with short dark spiky hair in a red shirt, looking to the right side of the frame, 3/4 profile angle, talking to someone off screen.",
            aspect_ratio: "1:1",
            output_format: "png"
        }
    });
    
    const imgUrl = Array.isArray(outImg) ? (outImg[0].url ? outImg[0].url() : outImg[0]) : (outImg.url ? outImg.url() : outImg);
    console.log('Image URL:', imgUrl);
    
    // Upload image to cloudinary so it's a persistent public URL
    const imgPath = '/tmp/test_profile.png';
    const res = await axios.get(imgUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(imgPath);
    res.data.pipe(writer);
    await new Promise(r => writer.on('finish', r));
    
    const upImg = await cloudinary.uploader.upload(imgPath, { resource_type: 'image' });
    console.log('Uploaded Image:', upImg.secure_url);
    
    console.log('2. Uploading Audio...');
    const audioPath = '/tmp/war_peace_v10/turn1_speech.mp3';
    const upAudio = await cloudinary.uploader.upload(audioPath, { resource_type: 'auto' });
    
    console.log('3. Running SadTalker...');
    for (let i = 1; i <= 8; i++) {
        try {
            const outVid = await replicate.run('cjwbw/sadtalker:3aa3dac9353cc4d6bd62a8f95957bd844003b401ca4e4a9b33baa574c549d376', {
                input: {
                    source_image: upImg.secure_url,
                    driven_audio: upAudio.secure_url,
                    still: false,
                    enhancer: "gfpgan",
                    preprocess: "full"
                }
            });
            console.log('Success! Video URL:', Array.isArray(outVid) ? outVid[0] : outVid);
            break;
        } catch (err) {
            const msg = String(err.message || '');
            if ((msg.includes('429') || msg.includes('throttled')) && i < 8) {
                const secs = (msg.match(/resets in ~(\d+)s/) || [])[1];
                const wait = secs ? +secs + 3 : 12;
                console.warn(`  ⚠  Rate limited. Retry ${i + 1}/8 in ${wait}s...`);
                await new Promise(r => setTimeout(r, wait * 1000));
            } else {
                console.error('SadTalker failed on profile image:', err.message);
                break;
            }
        }
    }
}
run();
