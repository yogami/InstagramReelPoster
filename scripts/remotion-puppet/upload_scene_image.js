require('dotenv').config({ path: '../../.env' });
const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadImage() {
  const filePath = path.join(__dirname, 'public', 'beach_full_scene.png');
  console.log(`Uploading ${filePath} to Cloudinary...`);
  
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'image',
      folder: 'remotion_prototypes',
      public_id: 'beach_full_scene',
      overwrite: true,
    });
    console.log(`\n✅ Upload Successful!`);
    console.log(`URL: ${result.secure_url}`);
    return result.secure_url;
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
  }
}

uploadImage();
