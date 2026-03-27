import dotenv from 'dotenv';
import { SovereignStillscapeEngine } from '../src/lib/product-demo/domain/services/SovereignStillscapeEngine';

dotenv.config();

async function main() {
    console.log("Testing Sovereign Stillscape Engine...");
    
    const engine = new SovereignStillscapeEngine({
        replicateApiToken: process.env.REPLICATE_API_TOKEN!,
        fishApiKey: process.env.FISH_AUDIO_API_KEY!,
        fishVoiceId: process.env.FISH_AUDIO_VOICE_ID || "716594c03801446bb87a964a1c2a5895",
        cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME!,
        cloudinaryApiKey: process.env.CLOUDINARY_API_KEY!,
        cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET!,
        makeWebhookUrl: process.env.MAKE_WEBHOOK_URL || "https://hook.eu2.make.com/o55ndmi2ncxnmxlxk7txibyemtifpjwi",
        makeApiKey: "4LyPD8E3TVRmh_F"
    });

    const caption = "The silence of the desert masters your soul. #desert #mysticism";
    
    // Test with just two acts to save time & money, generating a 15-second teaser.
    const url = await engine.execute(`stillscape_test_${Date.now()}`, caption, [
        {
            id: 'act1',
            narration: "The desert does not speak. ... It strips you of every illusion.",
            visualPrompt: "A solitary mystic walking in a massive, hyper-realistic desert dunescape at twilight. Photorealistic, cinematic, 8k",
            typography: [
                {text: "THE DESERT", color: "white"},
                {text: "STRIPS YOU", color: "yellow"}
            ]
        },
        {
            id: 'act2',
            narration: "Until, all that remains... is the absolute void. ... and the silence.",
            visualPrompt: "Absolute silence represented by a dark, starry night sky above endless black sand dunes. Mystical, ethereal, 8k",
            typography: [
                {text: "ABSOLUTE", color: "white"},
                {text: "VOID", color: "yellow"}
            ]
        }
    ]);

    console.log("DONE. URL:", url);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
