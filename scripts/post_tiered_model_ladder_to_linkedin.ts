/**
 * LinkedIn Blog Promotion Script: Tiered Model Ladder
 * 
 * Posts a summary of the Tiered Model Ladder blog post to LinkedIn
 * via Make.com webhook for Berlin AI Labs marketing.
 */

import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';
import { LinkedInPostPayload } from '../src/domain/ports/ILinkedInPosterService';

async function postLadderBlogToLinkedIn() {
    // Using the same webhook and key as the previous successful post
    const webhookUrl = 'https://hook.eu2.make.com/aksewbm7gh4md34mfygdn7ssvl8d7p8l';
    const apiKey = 'yamigopal';

    console.log('🚀 Posting "Tiered Model Ladder" blog announcement to LinkedIn...');

    const posterService = new WebhookLinkedInPosterService(webhookUrl, apiKey);

    const blogUrl = 'https://berlinailabs.de/blog/tiered-model-ladder.html';

    const content = `🔧 New Blog Post: Improving LLM Response Quality with a Tiered Model Ladder

Not all AI turns are created equal. The first few exchanges carry the highest leverage—they determine whether the assistant understands the goal, captures constraints, and establishes a stable structure.

In our latest deep dive, Chris Igel from Berlin AI Labs explores a pragmatic orchestration pattern: The Tiered Model Ladder.

🚀 The Core Strategy:
✅ Invest in Framing: Use high-reasoning models for planning and setting the scaffold.
✅ Economize on Execution: Hand off routine tasks to lightweight models once the boundaries are set.
✅ Managed Handoffs: Use "handoff memory" to prevent drift and loss of context.
✅ Smart Routing: Transition back to advanced tiers only when complexity spikes.

This approach delivers production-grade quality while significantly optimizing cost and latency. It's about building smarter, not just bigger.

Read the full article: ${blogUrl}

#AIEngineering #LLM #AIOrchestration #BerlinAILabs #AIOptimization #SystemDesign #SoftwareEngineering #AI #MachineLearning #Efficiency #ProductManagement`;

    const payload: LinkedInPostPayload = {
        type: 'ARTICLE',
        content: content,
        visibility: 'PUBLIC' as const,
        media: {
            originalUrl: blogUrl,
            title: 'Improving LLM Response Quality with a Tiered Model Ladder',
            description: 'How to deliver production-grade AI quality at lower cost using a tiered orchestration pattern. A technical guide from Berlin AI Labs.',
            thumbnail: {
                fileName: '',
                data: null
            }
        }
    };

    try {
        const result = await posterService.postToLinkedIn(payload);

        if (result.success) {
            console.log('✅ Success! Ladder blog announcement posted to LinkedIn.');
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

postLadderBlogToLinkedIn();
