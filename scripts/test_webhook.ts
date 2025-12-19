
import axios from 'axios';

const WEBHOOK_URL = 'https://hook.eu2.make.com/o55ndmi2ncxnmxlxk7txibyemtifpjwi';
// Valid Cloudinary URL we vouched for
const VIDEO_URL = 'https://res.cloudinary.com/djol0rpn5/video/upload/v1766174896/instagram-reels/final-videos/reel_job_ea9bad5d_1766174893088.mp4';
const API_KEY = '4LyPD8E3TVRmh_F';

async function triggerWebhook() {
    console.log('🚀 Triggering Make.com webhook with TEST payload...');

    const payload = {
        jobId: 'TEST_JOB_' + Date.now(),
        status: 'completed',
        caption: 'TEST CAPTION: This is a validation webhook to help mapping in Make.com.',
        // Provide ALL aliases to ensure Make.com sees them
        video_url: VIDEO_URL,
        url: VIDEO_URL,
        videoUrl: VIDEO_URL,
        metadata: {
            duration: 30,
            createdAt: new Date(),
            completedAt: new Date(),
            test: true
        }
    };

    try {
        const response = await axios.post(WEBHOOK_URL, payload, {
            headers: {
                'Content-Type': 'application/json',
                'x-make-apikey': API_KEY
            }
        });

        console.log(`✅ Webhook sent! Status: ${response.status}`);
        console.log('Response:', response.data);
        console.log('\n--> Go to Make.com Scenario -> Click Webhook Module -> "Redetermine Data Structure" (or see recent data)');
        console.log('--> Then Click Instagram Module -> Map "video_url" (or "url") from the new data.');

    } catch (error: any) {
        console.error('❌ Failed to trigger webhook:', error.message);
        if (error.response) {
            console.error('Identify:', error.response.status, error.response.data);
        }
    }
}

triggerWebhook();
