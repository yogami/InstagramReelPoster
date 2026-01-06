
import dotenv from 'dotenv';
import path from 'path';
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient';
import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';

dotenv.config();

const CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME || '';
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY || '';
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET || '';

const LINKEDIN_WEBHOOK_URL = process.env.LINKEDIN_WEBHOOK_URL || '';
const LINKEDIN_WEBHOOK_API_KEY = process.env.LINKEDIN_WEBHOOK_API_KEY || '';

const LOCAL_IMAGE_PATH = '/Users/user1000/gitprojects/BerlinAILabsSite/blog/freedom-joy.png';
const BLOG_URL = 'https://berlinailabs.de/blog/unleash-your-inner-artist.html';

async function main() {
    try {
        console.log('🚀 Starting Freedom Campaign...');

        // 1. Upload to Cloudinary
        const storage = new MediaStorageClient(CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET);
        console.log('📤 Uploading image to Cloudinary...');
        const uploadResult = await storage.uploadImage(LOCAL_IMAGE_PATH, {
            folder: 'blog-freedom',
            publicId: `freedom_joy_${Date.now()}`,
            tags: ['freedom', 'automation', 'berlin-ai-labs']
        });
        console.log('✅ Image uploaded:', uploadResult.url);

        // 2. Post to LinkedIn
        const linkedin = new WebhookLinkedInPosterService(LINKEDIN_WEBHOOK_URL, LINKEDIN_WEBHOOK_API_KEY);

        const content = `Humans weren’t designed to sit in gray cubicles debating coffee temperatures. We were designed to dance, paint, and love. 🎨💃❤️

At Berlin AI Labs, we built a self-healing AI loop that fixes production errors while we’re out living our best lives. 🦾✨

Check out how we stopped the 'Nerd-Loop' to reclaim our humanity:
${BLOG_URL}

#AI #Automation #Freedom #SoftwareEngineering #BerlinAILabs #SelfHealingAI #WorkLifeBalance`;

        console.log('📱 Posting to LinkedIn...');
        const postResult = await linkedin.postToLinkedIn({
            content,
            originalUrl: uploadResult.url,
            title: 'Unleash Your Inner Artist: Stopping the Nerd-Loop with Self-Healing AI',
            altText: 'A vibrant group of people enjoying life in Berlin away from computers'
        });

        if (postResult.success) {
            console.log('🎉 LinkedIn post successful!');
        } else {
            console.error('❌ LinkedIn post failed:', postResult.error);
        }

    } catch (error: any) {
        console.error('💥 Error in Freedom Campaign:', error.message);
    }
}

main();
