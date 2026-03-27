/**
 * Upload Zurich Pitch v9 to Cloudinary
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadVideo() {
    const videoPath = path.resolve(process.cwd(), 'pitch_segments_v9/zurich_pitch_final.mp4');
    console.log(`Uploading ${videoPath} to Cloudinary...`);

    try {
        const result = await cloudinary.uploader.upload(videoPath, {
            resource_type: 'video',
            public_id: 'zurich_pitch_FINAL_verified',
            folder: 'pitch_videos',
            overwrite: true
        });

        console.log('\n✅ Upload Complete!');
        console.log('Secure URL:', result.secure_url);
        console.log('Public ID:', result.public_id);
        console.log('Duration:', result.duration, 'seconds');
        console.log('Format:', result.format);
        console.log('Size:', (result.bytes / (1024 * 1024)).toFixed(1), 'MB');
    } catch (error) {
        console.error('❌ Upload failed:', error);
    }
}

uploadVideo();
