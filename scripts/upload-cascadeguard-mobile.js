
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function upload() {
    const videoPath = '/Users/user1000/gitprojects/cascade-guard-scf/video_assembly_openai/CascadeGuard_Mobile_Square.mp4';
    console.log(`Uploading Mobile Square video to Cloudinary: ${videoPath}`);

    try {
        const result = await cloudinary.uploader.upload(videoPath, {
            resource_type: 'video',
            public_id: 'cascadeguard_linkedin_pitch_mobile_square',
            folder: 'pitch_videos',
            overwrite: true
        });

        console.log('\n✅ MOBILE UPLOAD COMPLETE');
        console.log('URL:', result.secure_url);
    } catch (error) {
        console.error('❌ UPLOAD FAILED:', error);
    }
}

upload().catch(console.error);
