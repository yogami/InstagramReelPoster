const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function upload() {
    const videoPath = path.resolve(process.cwd(), 'verified_segments/zurich_pitch_FINAL.mp4');
    console.log('Uploading final video to Cloudinary...');

    const result = await cloudinary.uploader.upload(videoPath, {
        resource_type: 'video',
        public_id: 'zurich_pitch_FINAL_verified',
        folder: 'pitch_videos',
        overwrite: true
    });

    console.log('\n✅ UPLOAD COMPLETE');
    console.log('URL:', result.secure_url);
}

upload().catch(console.error);
