import axios from 'axios';

async function runTest() {
    const topicPrompt = `
    Post a reel on surrendering or giving up when in a state of anxiety or panic and let god, universe, or simply the body's natural state and intelligence do the work for you. Let it lead you into action rather than letting the mind be your driver. Find a reference to a book or a teacher who advocates this and quote that in the reel. Make it visually stunning and use deep abstract metaphors.
    `;

    console.log("Submitting Reel Request for topic:", topicPrompt.trim().substring(0, 100) + '...');

    try {
        const response = await axios.post('http://localhost:3000/api/process-reel', {
            // The pipeline uses the sourceAudioUrl field to pass the initial text prompt when testing
            sourceAudioUrl: "user_prompt:" + encodeURIComponent(topicPrompt),
            targetDurationRange: { min: 20, max: 40 },
            forceMode: 'direct' // Direct commentary style with images
        });

        console.log("Job Scheduled Successfully:", response.data);
        const jobId = response.data.jobId;

        console.log(`Polling job status for ${jobId}...`);

        let status = response.data.status || 'pending';
        while (status === 'pending' || status === 'processing' || status === 'planning') {
            await new Promise(r => setTimeout(r, 5000));
            const statusRes = await axios.get(`http://localhost:3000/jobs/${jobId}`);
            status = statusRes.data.status;
            console.log(`[${jobId}] Status: ${status}`);

            if (status === 'completed') {
                console.log("\n✅ Video Generation Complete!");
                console.log("Video URL:", statusRes.data.finalVideoUrl);
                console.log("Caption:", statusRes.data.captionBody);
                break;
            } else if (status === 'failed') {
                console.error("\n❌ Video Generation Failed!");
                console.error("Error:", statusRes.data.error);
                break;
            }
        }
    } catch (err: any) {
        console.error("Error submitting job:", err.response?.data || err.message);
    }
}

runTest();
