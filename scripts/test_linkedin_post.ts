import { MakeLinkedInPosterService } from '../src/infrastructure/linkedin/MakeLinkedInPosterService';
import { LinkedInPostPayload } from '../src/domain/ports/ILinkedInPosterService';

async function testLinkedInPost() {
    const webhookUrl = 'https://hook.eu2.make.com/aksewbm7gh4md34mfygdn7ssvl8d7p8l';
    const apiKey = 'yamigopal';

    console.log('🚀 Starting LinkedIn Test Post...');
    console.log(`URL: ${webhookUrl}`);

    const posterService = new MakeLinkedInPosterService(webhookUrl, apiKey);

    const testPayload: LinkedInPostPayload = {
        type: 'ARTICLE',
        content: '🚀 Testing LinkedIn integration from my automated poster!\n\nThis is a test post sent via Make.com webhook to verify the connection.\n\n#AI #Automation #BuildInPublic #Testing',
        visibility: 'PUBLIC' as const,
        media: {
            originalUrl: 'https://www.linkedin.com/in/yamigopal/',
            title: 'Testing LinkedIn Automation',
            description: 'Verifying that complex article mapping works in Make.com',
            thumbnail: {
                fileName: '',
                data: null
            }
        }
    };

    try {
        const result = await posterService.postToLinkedIn(testPayload);

        if (result.success) {
            console.log('✅ Success! Test post sent to Make.com.');
            console.log('Result:', JSON.stringify(result, null, 2));
        } else {
            console.error('❌ Failed to send test post.');
            console.error('Error:', result.error);
        }
    } catch (error) {
        console.error('💥 An unexpected error occurred:');
        console.error(error);
    }
}

testLinkedInPost();
