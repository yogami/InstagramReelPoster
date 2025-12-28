/**
 * LinkedIn Blog Promotion Script
 * 
 * Posts a summary of the AI Engineering Best Practices blog post to LinkedIn
 * via Make.com webhook for Berlin AI Labs marketing.
 */

import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';
import { LinkedInPostPayload } from '../src/domain/ports/ILinkedInPosterService';

async function postBlogToLinkedIn() {
    const webhookUrl = 'https://hook.eu2.make.com/aksewbm7gh4md34mfygdn7ssvl8d7p8l';
    const apiKey = 'yamigopal';

    console.log('🚀 Posting blog announcement to LinkedIn...');

    const posterService = new WebhookLinkedInPosterService(webhookUrl, apiKey);

    const blogUrl = 'https://berlinailabs.de/blog/ai-engineering-best-practices.html';

    const content = `🔧 New Blog Post: AI Engineering Best Practices

Building AI systems that actually work in production requires more than clever algorithms. It demands engineering discipline, systematic thinking, and a commitment to craftsmanship.

In our latest article, Yami Gopal from Berlin AI Labs shares the core principles that guide our work:

✅ The "peer planner" approach for thoughtful project planning
✅ Test first development that catches bugs before they happen
✅ Clean code philosophy for maintainable systems
✅ Structured bug fixing protocols (Red, Green, Refactor)
✅ Quality gates that prevent technical debt

These practices are not just theory. They are the foundation of every reliable AI solution we deliver to our clients.

Read the full article: ${blogUrl}

#AIEngineering #SoftwareCraftsmanship #BerlinAILabs #TestDrivenDevelopment #CleanCode #AI #MachineLearning #SoftwareEngineering #TDD #CodeQuality`;

    const payload: LinkedInPostPayload = {
        type: 'ARTICLE',
        content: content,
        visibility: 'PUBLIC' as const,
        media: {
            originalUrl: blogUrl,
            title: 'AI Engineering Best Practices: Building Reliable Systems with Craftsmanship',
            description: 'How structured planning, test driven development, and code quality standards create AI systems you can trust. A practical guide from Berlin AI Labs.',
            thumbnail: {
                fileName: '',
                data: null
            }
        }
    };

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
