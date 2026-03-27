
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const segmentId = process.argv[2] || '1';
const videoPath = path.resolve(process.cwd(), `verified_segments/segment_${segmentId}.mp4`);

async function upload() {
    console.log(`Uploading segment ${segmentId}...`);
    const result = await cloudinary.uploader.upload(videoPath, {
        resource_type: 'video',
        public_id: `zurich_segment_${segmentId}`,
        folder: 'pitch_reviews',
        overwrite: true
    });
    console.log('URL:', result.secure_url);
}

upload().catch(console.error);
