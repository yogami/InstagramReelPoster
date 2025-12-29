import { FluxImageClient } from '../src/infrastructure/images/FluxImageClient';
import * as dotenv from 'dotenv';

dotenv.config();

async function testFluxAPI() {
    const apiKey = process.env.BEAMCLOUD_API_KEY;
    const endpoint = process.env.BEAMCLOUD_ENDPOINT_URL || 'https://app.beam.cloud/endpoint/flux1-image';

    if (!apiKey) {
        console.error('❌ BEAMCLOUD_API_KEY not set in .env');
        process.exit(1);
    }

    console.log('🧪 Testing Flux API...');
    console.log(`📍 Endpoint: ${endpoint}`);
    console.log(`🔑 API Key: ${apiKey.substring(0, 10)}...`);
    console.log('');

    const client = new FluxImageClient(apiKey, endpoint);

    try {
        console.log('🎨 Generating test image...');
        const result = await client.generateImage('a serene mountain landscape at sunset, cinematic lighting');

        console.log('✅ SUCCESS!');
        console.log(`📸 Image URL length: ${result.imageUrl.length} chars`);
        console.log(`🔗 Image URL preview: ${result.imageUrl.substring(0, 100)}...`);

        if (result.imageUrl.startsWith('data:image')) {
            console.log('✅ Received base64 image');
        } else if (result.imageUrl.startsWith('http')) {
            console.log('✅ Received HTTP URL');
        }
    } catch (error) {
        console.error('❌ FAILED!');
        console.error('Error:', error);

        if (error instanceof Error) {
            console.error('Message:', error.message);
            console.error('Stack:', error.stack);
        }

        process.exit(1);
    }
}

testFluxAPI();
