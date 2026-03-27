/**
 * Final Stitch - Combines all 12 verified segments + background music
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const OUTPUT_DIR = path.resolve(__dirname, '../verified_segments');
const BG_MUSIC = path.resolve(__dirname, '../background_music.mp3');

function getAudioDuration(filePath) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    return parseFloat(result.stdout.toString().trim());
}

function main() {
    console.log('\n=== FINAL STITCH ===\n');

    // Create concat list
    const segments = [];
    for (let i = 1; i <= 12; i++) {
        const segPath = path.join(OUTPUT_DIR, `segment_${i}.mp4`);
        if (fs.existsSync(segPath)) {
            segments.push(segPath);
            const dur = getAudioDuration(segPath);
            console.log(`Segment ${i}: ${dur.toFixed(2)}s`);
        } else {
            console.error(`ERROR: Missing segment_${i}.mp4`);
            process.exit(1);
        }
    }

    const totalDuration = segments.reduce((sum, seg) => sum + getAudioDuration(seg), 0);
    console.log(`\nTotal duration: ${totalDuration.toFixed(2)}s`);

    // Concatenate
    const concatList = path.join(OUTPUT_DIR, 'final_concat.txt');
    fs.writeFileSync(concatList, segments.map(s => `file '${s}'`).join('\n'));

    console.log('\nConcatenating segments...');
    const noMusicPath = path.join(OUTPUT_DIR, 'zurich_no_music.mp4');
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${noMusicPath}"`);

    // Add background music
    console.log('Adding background music...');
    const finalPath = path.join(OUTPUT_DIR, 'zurich_pitch_FINAL.mp4');
    execSync(`ffmpeg -y -i "${noMusicPath}" -stream_loop -1 -i "${BG_MUSIC}" -filter_complex "[1:a]volume=0.04[bg];[0:a][bg]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${finalPath}"`);

    const finalDuration = getAudioDuration(finalPath);
    console.log(`\n=== COMPLETE ===`);
    console.log(`Final video: ${finalPath}`);
    console.log(`Duration: ${finalDuration.toFixed(2)}s`);
}

main();
