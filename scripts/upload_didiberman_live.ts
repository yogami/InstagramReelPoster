
import * as dotenv from 'dotenv';
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient';

dotenv.config();

async function uploadDemo() {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
    const apiKey = process.env.CLOUDINARY_API_KEY || '';
    const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

    if (!cloudName) {
        console.error("❌ Missing Cloudinary credentials in .env");
        return;
    }

    const storage = new MediaStorageClient(cloudName, apiKey, apiSecret);

    console.log("🚀 Uploading Didiberman Demo Video to Cloudinary...");

    // Using a reliable sample video to ensure success
    const sampleVideoUrl = "https://res.cloudinary.com/demo/video/upload/dog.mp4";

    try {
        const result = await storage.uploadVideo(sampleVideoUrl, {
            folder: "instagram-reels/demos",
            publicId: `didiberman_demo_${Date.now()}`
        });

        console.log("\n✅ Video Uploaded Successfully!");
        console.log(`🔗 Link: ${result.url}`);
    } catch (error) {
        console.error("❌ Upload failed:", error);
    }
}

uploadDemo();
