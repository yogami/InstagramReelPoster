import axios from 'axios';
import { getConfig } from '../src/config';

async function probe() {
    const config = getConfig();
    const apiKey = config.kieApiKey;
    const taskId = '4274eab873e305ffb09b613976a36441';
    const baseUrl = 'https://api.kie.ai/api/v1';

    const endpoints = [
        `${baseUrl}/jobs/recordInfo?taskId=${taskId}`,
        `${baseUrl}/jobs/record-info?taskId=${taskId}`,
        `${baseUrl}/jobs/status/${taskId}`,
        `https://api.kie.ai/api/v1/market/record-info?taskId=${taskId}`,
        `https://api.kie.ai/api/v1/mp4/record-info?taskId=${taskId}`,
        `https://api.kie.ai/api/v1/runway/record-detail?taskId=${taskId}`
    ];

    console.log(`Probing endpoints for Task ID: ${taskId}`);

    for (const endpoint of endpoints) {
        try {
            console.log(`Checking: ${endpoint}`);
            const response = await axios.get(endpoint, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            console.log(`✅ Success (200) at: ${endpoint}`);
            console.log('Response:', JSON.stringify(response.data, null, 2));
            return;
        } catch (error: any) {
            console.log(`❌ Fail (${error.response?.status || 'Error'}) at: ${endpoint}`);
            if (error.response?.data) {
                console.log('Error data:', JSON.stringify(error.response.data));
            }
        }
    }
}

probe().catch(console.error);
