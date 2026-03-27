
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function uploadVideo() {
    const videoPath = path.resolve(process.cwd(), 'pitch_segments_v8/zurich_pitch_final.mp4');
    console.log(`Uploading ${videoPath} to Cloudinary...`);

    try {
        const result = await cloudinary.uploader.upload(videoPath, {
            resource_type: 'video',
            public_id: 'zurich_pitch_2026',
            folder: 'pitch_videos',
            overwrite: true
        });

        console.log('SUCCESS: Video uploaded successfully!');
        console.log('Secure URL:', result.secure_url);
    } catch (error) {
        console.error('FAILURE: Upload failed:', error);
    }
}

uploadVideo();
