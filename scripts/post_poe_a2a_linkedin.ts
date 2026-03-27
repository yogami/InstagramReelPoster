/**
 * Post PoE-A2A Announcement to LinkedIn via Make.com webhook
 */
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const LINKEDIN_WEBHOOK_URL = process.env.LINKEDIN_WEBHOOK_URL || '';
const LINKEDIN_WEBHOOK_API_KEY = process.env.LINKEDIN_WEBHOOK_API_KEY || '';

const POE_VIDEO_URL = 'https://res.cloudinary.com/djol0rpn5/video/upload/v1770156402/poe_a2a_colosseum_presentation_2026.mp4';
const GITHUB_URL = 'https://github.com/yogami/pdp-protocol';

const linkedInPost = `Your AI agent has an identity.

But can it prove what it actually did?

That's the problem with Google's A2A protocol – it tells you WHO an agent is, but not WHAT it accomplished.

So I built PoE-A2A: a lightweight HTTP-first extension that lets agents prove their execution history with cryptographic signatures.

🔑 Key features:
• Works with any web host (no blockchain required)
• Ed25519 signatures verified locally in <5ms
• Optional Solana anchoring for enterprise-grade audit trails
• Extends the standard A2A AgentCard format

📹 82-second overview: ${POE_VIDEO_URL}

🔗 Open source on GitHub: ${GITHUB_URL}

The spec just passed adversarial review from 5 different LLMs and reached "Informational Standard Material" status.

What's your take – is execution verification becoming a must-have for the agentic economy?

#AI #Agents #A2A #Solana #OpenSource #AIEngineering #Verification #TrustButVerify`;

async function postToLinkedIn() {
    console.log('📝 Posting PoE-A2A announcement to LinkedIn...\n');

    if (!LINKEDIN_WEBHOOK_URL || !LINKEDIN_WEBHOOK_API_KEY) {
        console.error('❌ Missing LINKEDIN_WEBHOOK_URL or LINKEDIN_WEBHOOK_API_KEY in .env');
        console.log('\nPlease ensure these are set in /Users/user1000/gitprojects/InstagramReelPoster/.env');
        process.exit(1);
    }

    const payload = {
        content: linkedInPost,
        visibility: 'PUBLIC',
        originalUrl: POE_VIDEO_URL,
        title: 'PoE-A2A: Proof of Execution for AI Agents',
        type: 'ARTICLE'
    };

    try {
        console.log(`🔗 Sending to webhook: ${LINKEDIN_WEBHOOK_URL.substring(0, 50)}...`);

        const response = await axios.post(
            LINKEDIN_WEBHOOK_URL,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-make-apikey': LINKEDIN_WEBHOOK_API_KEY,
                },
                timeout: 30000,
            }
        );

        console.log(`\n✅ SUCCESS! Response status: ${response.status}`);
        console.log('Response data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        if (axios.isAxiosError(error) && error.response) {
            console.error(`❌ HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else {
            console.error('❌ Error:', error instanceof Error ? error.message : error);
        }
        process.exit(1);
    }
}

postToLinkedIn();
