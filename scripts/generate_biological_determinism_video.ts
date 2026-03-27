import dotenv from 'dotenv';
import { SovereignStillscapeEngine } from '../src/lib/product-demo/domain/services/SovereignStillscapeEngine';

dotenv.config();

async function main() {
    console.log("Starting Biological Determinism Video Pipeline...");
    
    const engine = new SovereignStillscapeEngine({
        replicateApiToken: process.env.REPLICATE_API_TOKEN!,
        fishApiKey: process.env.FISH_AUDIO_API_KEY!,
        fishVoiceId: process.env.FISH_AUDIO_VOICE_ID || "716594c03801446bb87a964a1c2a5895",
        cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME!,
        cloudinaryApiKey: process.env.CLOUDINARY_API_KEY!,
        cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET!,
        makeWebhookUrl: process.env.MAKE_WEBHOOK_URL || "https://hook.eu2.make.com/o55ndmi2ncxnmxlxk7txibyemtifpjwi",
        makeApiKey: "4LyPD8E3TVRmh_F" // From validated test script
    });

    const caption = "You cannot escape your animal hardware. Both Matriarchy and Patriarchy are biological power games. The only true rebellion against nature, is the spiritual transcendence of the Sage. 👁️ \n\n#nonduality #spirituality #biologicaldeterminism #philosophy #stoicism #sages";
    
    const url = await engine.execute(`bio_determinism_${Date.now()}`, caption, [
        {
            id: 'act1',
            narration: "Nature designed sex, strictly for survival. ... But we, spun it into a religion of romance. ... A desperate attempt, to mask the biological power game.",
            visualPrompt: "A dark, cinematic visualization of ancient DNA strands transforming into chaotic, grasping human hands reaching out in the dark. Photorealistic, moody, 8k",
            typography: [
                {text: "BIOLOGICAL", color: "white"},
                {text: "POWER GAME", color: "yellow"}
            ]
        },
        {
            id: 'act2',
            narration: "Both genders, are trapped in this hardware. ... Patriarchy leverages power, to monopolize reproduction. ... Matriarchy leverages choice, creating a brutal hierarchy of preference.",
            visualPrompt: "Two towering ancient stone statues—one a formidable king, one a regal queen—both shown fully chained to a massive, ancient tree root system in a desolate landscape. Photorealistic, cinematic lighting.",
            typography: [
                {text: "TRAPPED IN", color: "white"},
                {text: "HARDWARE", color: "yellow"}
            ]
        },
        {
            id: 'act3',
            narration: "Neither, is morally superior. ... To those who claim their romantic ideals are holy: ... Have you conquered jealousy? ... Have you conquered competition?",
            visualPrompt: "Hyper-realistic, dark shot of an ancient theatrical mask, split down the middle showing a beautiful human face and a snarling, primal wolf face. 8k.",
            typography: [
                {text: "HAVE YOU CONQUERED", color: "white"},
                {text: "COMPETITION?", color: "yellow"}
            ]
        },
        {
            id: 'act4',
            narration: "If you say yes, you are lying. ... You are lying, because you want to believe you are better than an animal. ... But everyone, is scamming everyone.",
            visualPrompt: "A dense, dark jungle with a single glowing golden apple hanging from a branch, surrounded by creeping shadows and predatory eyes. Cinematic 8k.",
            typography: [
                {text: "SCAMMING", color: "white"},
                {text: "EVERYONE", color: "yellow"}
            ]
        },
        {
            id: 'act5',
            narration: "There is only one true rebellion. ... The ancient saints and seekers found the hack. ... Bypassing the biological drive entirely, by pursuing the divine. ... It is the only escape.",
            visualPrompt: "A solitary mystic meditating deeply in an absolute void, with a brilliant, supernatural aura radiating out, severing ethereal chains. Cinematic, photorealistic, 8k.",
            typography: [
                {text: "THE ONLY", color: "white"},
                {text: "REBELLION", color: "yellow"}
            ]
        }
    ]);

    console.log("DONE. URL:", url);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
