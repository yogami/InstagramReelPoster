import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function test() {
    console.log("Testing Pixabay Audio...");
    try {
        const pixRes = await axios.get(`https://pixabay.com/api/audio/?key=${process.env.PIXABAY_API_KEY}&q=meditation`);
        console.log("Pixabay Hits:", pixRes.data.hits[0]);
    } catch(e:any) { console.error("Pixabay Err:", e.message); }

    console.log("Testing OpenAI...");
    try {
        const oaiRes = await axios.post('https://api.openai.com/v1/images/generations', {
            model: "dall-e-3",
            prompt: "A minimalist map of Berlin with glowing connection points, illustrating community growth. Flat vector, navy and terracotta.",
            n: 1,
            size: "1024x1792"
        }, { headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` }});
        console.log("OAI Image URL:", oaiRes.data.data[0].url);
    } catch(e:any) { console.error("OAI Err:", e.response?.data || e.message); }
}
test();
