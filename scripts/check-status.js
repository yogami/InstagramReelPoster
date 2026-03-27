
const axios = require('axios');
const fs = require('fs');

const jobId = fs.readFileSync('tmp/render_job.txt', 'utf8').trim();
const API_KEY = process.env.SHOTSTACK_API_KEY || 'LJNXXYI7J8EJOZIIVteBeLcpqhFfNh3UnI8LyiGp';

async function checkStatus() {
    console.log(`Checking status for job: ${jobId}`);
    try {
        const response = await axios.get(`https://api.shotstack.io/v1/render/${jobId}`, {
            headers: { 'x-api-key': API_KEY }
        });

        const status = response.data.response.status;
        console.log(`Current Status: ${status}`);

        if (status === 'done') {
            console.log('✅ Video Rendered Successfully!');
            console.log('URL:', response.data.response.url);
        } else if (status === 'failed') {
            console.error('❌ Render Failed:', response.data.response.error);
        } else {
            console.log('⏳ Still rendering...');
        }
    } catch (error) {
        console.error('Error checking status:', error.message);
    }
}

checkStatus();
