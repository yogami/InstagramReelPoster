require('dotenv').config({ path: '../.env' });
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadVideo() {
  const filePath = '../scripts/remotion-puppet/out/beach_scene.mp4';
  console.log(`Uploading ${filePath} to Cloudinary...`);
  
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'video',
      folder: 'remotion_prototypes'
    });
    console.log('\n✅ Upload Successful!');
    console.log(`URL: ${result.secure_url}`);
  } catch (error) {
    console.error('❌ Upload Failed:', error);
  }
}

uploadVideo();
