
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

async function upload() {
    const videoPath = '/Users/user1000/gitprojects/cascade-guard-scf/video_assembly_openai/CascadeGuard_LinkedIn_Final_Music.mp4';
    console.log(`Uploading final video (OpenAI Voice) to Cloudinary: ${videoPath}`);

    try {
        const result = await cloudinary.uploader.upload(videoPath, {
            resource_type: 'video',
            public_id: 'cascadeguard_linkedin_pitch_openai',
            folder: 'pitch_videos',
            overwrite: true,
            notification_url: process.env.CLOUDINARY_NOTIFICATION_URL
        });

        console.log('\n✅ UPLOAD COMPLETE');
        console.log('URL:', result.secure_url);
    } catch (error) {
        console.error('❌ UPLOAD FAILED:', error);
    }
}

upload().catch(console.error);
