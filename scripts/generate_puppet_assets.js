require('dotenv').config({ path: '../.env' });
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

async function downloadImage(url, dest) {
    console.log(`Downloading to ${dest}...`);
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream'
    });
    return new Promise((resolve, reject) => {
        response.data.pipe(fs.createWriteStream(dest))
            .on('finish', () => resolve())
            .on('error', e => reject(e));
    });
}

// Ensure the directory exists
const assetDir = path.join(__dirname, '../assets/puppet');
if (!fs.existsSync(assetDir)) {
    fs.mkdirSync(assetDir, { recursive: true });
}

// Using FLUX to generate the flat assets on a solid background, then removing the background using a bgremover
async function generateAsset(prompt, filename) {
    console.log(`\nGenerating: ${filename}...`);
    console.log(`Prompt: ${prompt}`);
    
    // Step 1: Generate the raw image
    const output = await replicate.run(
        "black-forest-labs/flux-schnell",
        {
            input: {
                prompt: prompt,
                output_format: "png",
                output_quality: 100,
                num_outputs: 1,
            }
        }
    );
    
    if (!output || !output[0]) {
        throw new Error("FLUX generation failed to return an image URL.");
    }
    
    const imageUrl = output[0];
    const rawDest = path.join(assetDir, filename.replace('.png', '_raw.png'));
    await downloadImage(imageUrl, rawDest);
    console.log(`Saved raw image to ${rawDest}`);

    // Step 2: Remove the background to make it a transparent puppet part
    console.log(`Removing background for ${filename}...`);
    const bgRemoval = await replicate.run(
        "lucataco/remove-bg:95fcc2a26d3899cd6c2691c900465aaeff466285a65c14638cc5f36f34befaf1",
        {
            input: {
                image: imageUrl
            }
        }
    );

    if (!bgRemoval) {
        throw new Error("Background removal failed.");
    }

    const finalDest = path.join(assetDir, filename);
    await downloadImage(bgRemoval, finalDest);
    console.log(`Saved transparent puppet part to ${finalDest}`);
}

async function main() {
    const stylePrefix = "A highly stylized, minimalist vector art illustration of an attorney wearing a dark suit. Flat cel shading, thick clean outlines, chicken scratch upgraded stick-figure aesthetic, solid white background. NO background elements. Centered.";
    
    try {
        // 1. Generate the isolated Body (shoulders down, no head)
        await generateAsset(
            `${stylePrefix} ONLY the torso and shoulders. The neck should be cut off abruptly. Arms crossed.`,
            "body.png"
        );

        // 2. Generate the isolated Head + closed mouth
        await generateAsset(
            `${stylePrefix} ONLY the head and neck. Looking slightly to the side. Closed mouth, natural resting face.`,
            "head_mouth_closed.png"
        );

        // 3. Generate the isolated Head + wide open mouth
        await generateAsset(
            `${stylePrefix} ONLY the head and neck. Looking slightly to the side. Mouth is wide open speaking loudly.`,
            "head_mouth_open.png"
        );

        // 4. Generate a minimalist background for the TwoShotScene
        await generateAsset(
            "A stylized, minimalist 2D flat vector sketch of a sterile office background. A desk line across the bottom third. Dull grey and beige colors. No characters.",
            "background.png"
        );

        console.log("\n\n✅ All static puppet assets generated successfully!");
    } catch (e) {
        console.error("\n❌ FAILED:", e);
    }
}

main();
