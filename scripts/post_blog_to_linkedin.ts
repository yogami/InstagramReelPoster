/**
 * LinkedIn Blog Promotion Script
 * 
 * Posts a summary of the AI Engineering Best Practices blog post to LinkedIn
 * via Make.com webhook for Berlin AI Labs marketing.
 */

import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';
import { LinkedInPostPayload } from '../src/domain/ports/ILinkedInPosterService';

async function postBlogToLinkedIn() {
    // 1. Configuration
    const WEBHOOK_URL = 'https://hook.eu2.make.com/aksewbm7gh4md34mfygdn7ssvl8d7p8l';
    const API_KEY = 'yamigopal'; // In production, use env var

    // Blog Article Details
    const ARTICLE_TITLE = "From URL to Video: A SOTA Architecture for Automated Promo Reels";
    const ARTICLE_DESCRIPTION = "How we built a system that turns any website into a high-converting video reel using a 'Blueprint First' approach.";
    const ARTICLE_URL = "https://berlinailabs.de/blog/sotavideo.html";

    // 2. Prepare Payload
    const content = `🎧 From Setlist to Video: How I tauto-generate promo reels

I'm a musician first, engineer second.

When I started building AI tools, I noticed something: AI is a terrible improviser. If you let it run wild, it writes a 20-minute drum solo that nobody wants to hear.

So I stopped trying to make the "Smartest" model and just gave it a better Setlist.

I wrote a quick breakdown of how I use "Blueprints" to keep my AI on beat. No complex jargon, just the flow.

Check it out if you're into building stuff:
${ARTICLE_URL}

#BuildingInPublic #Engineering #MusicAndTech #BerlinAILabs #KeepItSimple`;

    const payload: LinkedInPostPayload = {
        content: content,
        visibility: 'PUBLIC' as const,
        type: 'ARTICLE',
        media: {
            title: 'From URL to Video: The "Setlist" Architecture',
            description: ARTICLE_DESCRIPTION,
            originalUrl: ARTICLE_URL
        }
    };

    // 3. Send to Make.com
    console.log(`[🚀] Posting article to LinkedIn via Make.com...`);
    console.log(`    Title: ${ARTICLE_TITLE}`);

    // Initialize the service
    const posterService = new WebhookLinkedInPosterService(WEBHOOK_URL, API_KEY);

    try {
        const result = await posterService.postToLinkedIn(payload);

        if (result.success) {
            console.log('✅ Success! Blog announcement posted to LinkedIn.');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.error('❌ Failed to post to LinkedIn.');
            console.error('Error:', result.error);
        }
    } catch (error) {
        console.error('💥 An unexpected error occurred:');
        console.error(error);
    }
}

postBlogToLinkedIn();
