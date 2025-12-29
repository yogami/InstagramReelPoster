import { TimelineVideoRenderer } from '../src/infrastructure/video/TimelineVideoRenderer';
import { ReelManifest } from '../src/domain/entities/ReelManifest';
import * as dotenv from 'dotenv';

dotenv.config();

async function testVideoRendering() {
    const apiKey = process.env.TIMELINE_API_KEY;

    if (!apiKey) {
        console.error('❌ TIMELINE_API_KEY not set in .env');
        console.log('Please add: TIMELINE_API_KEY=your_key');
        process.exit(1);
    }

    console.log('🎬 Testing video rendering with branding overlay...\n');

    const manifest: ReelManifest = {
        durationSeconds: 10,
        voiceoverUrl: 'https://res.cloudinary.com/demo/video/upload/dog.mp3',
        musicUrl: 'https://res.cloudinary.com/demo/video/upload/bumblebee.mp3',
        musicDurationSeconds: 10,
        subtitlesUrl: '',
        segments: [
            {
                index: 0,
                imageUrl: 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=1080',
                caption: 'First scene',
                start: 0,
                end: 5
            },
            {
                index: 1,
                imageUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1080',
                caption: 'Last scene with contact info',
                start: 5,
                end: 10
            }
        ],
        logoUrl: 'https://logo.clearbit.com/google.com',
        logoPosition: 'overlay',
        branding: {
            logoUrl: 'https://logo.clearbit.com/google.com',
            businessName: 'Berlin AI Labs',
            address: 'Friedrichstraße 123, 10117 Berlin',
            phone: '+49 30 12345678',
            email: 'info@berlinailabs.de'
        }
    };

    console.log('📋 Manifest:');
    console.log('  - Duration: 10s');
    console.log('  - Segments: 2 (5s each)');
    console.log('  - Logo: Google logo (small, for testing)');
    console.log('  - Contact info: ✅ All fields present');
    console.log('');

    const renderer = new TimelineVideoRenderer(apiKey);

    try {
        console.log('🚀 Submitting to Timeline.io...');
        const result = await renderer.render(manifest);

        console.log('\n✅ SUCCESS!');
        console.log('');
        console.log('📹 Video URL:', result.videoUrl);
        console.log('🆔 Render ID:', result.renderId);
        console.log('');
        console.log('🔍 What to check:');
        console.log('  1. Logo in top-right corner (NOT stretched)');
        console.log('  2. Contact card at bottom of LAST segment (5-10s)');
        console.log('  3. Contact card should NOT have logo (logo is separate)');
        console.log('  4. Contact card shows: Business name + address + phone + email');
        console.log('');
        console.log('👉 Open this URL to view the video:');
        console.log(result.videoUrl);

    } catch (error) {
        console.error('\n❌ FAILED!');
        console.error('Error:', error);

        if (error instanceof Error) {
            console.error('Message:', error.message);
        }

        process.exit(1);
    }
}

testVideoRendering();
