/**
 * Upload Zurich Pitch v11 to Cloudinary
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
    const videoPath = path.resolve(__dirname, '../pitch_segments_v11/zurich_pitch_final.mp4');
    console.log('Uploading v11 to Cloudinary...');
    console.log(`File: ${videoPath}`);

    const result = await cloudinary.uploader.upload(videoPath, {
        resource_type: 'video',
        public_id: 'zurich_pitch_v11_FINAL',
        folder: 'pitch_videos',
        overwrite: true
    });

    console.log('\n✅ Upload complete!');
    console.log(`URL: ${result.secure_url}`);
    console.log(`Public ID: ${result.public_id}`);
    console.log(`Duration: ${result.duration}s`);
    console.log(`Size: ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
}

uploadVideo().catch(err => {
    console.error('❌ Upload failed:', err);
    process.exit(1);
});
