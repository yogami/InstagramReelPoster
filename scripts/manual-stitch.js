/**
 * Manual Stitch Script - Uses existing recorded segments
 * 
 * Correlates the webm files with audio files based on creation time,
 * merges them, and creates the final video.
 */

const path = require('path');
const fs = require('fs');
const { execSync, spawnSync } = require('child_process');

const outputDir = '/Users/user1000/gitprojects/InstagramReelPoster/pitch_segments_v8';

function getAudioDuration(filePath) {
    const result = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    return parseFloat(result.stdout.toString().trim());
}

function main() {
    console.log('\n=== MANUAL STITCH SCRIPT ===\n');

    // Get all webm files sorted by creation time
    const webmFiles = fs.readdirSync(outputDir)
        .filter(f => f.endsWith('.webm') && !f.includes('video_'))
        .map(f => ({
            name: f,
            time: fs.statSync(path.join(outputDir, f)).mtime.getTime()
        }))
        .sort((a, b) => a.time - b.time)
        .map(f => f.name);

    console.log('Found webm files (sorted by time):');
    webmFiles.forEach((f, i) => console.log(`  ${i + 2}: ${f}`));

    // Merge each webm with corresponding audio
    const mergedFiles = [];

    // Segment 1 is already merged
    if (fs.existsSync(path.join(outputDir, 'final_1.mp4'))) {
        mergedFiles.push(path.join(outputDir, 'final_1.mp4'));
        console.log('\nSegment 1: Using existing final_1.mp4');
    }

    // Process segments 2-12
    for (let i = 0; i < webmFiles.length; i++) {
        const segId = i + 2; // Segments 2-12
        const webmPath = path.join(outputDir, webmFiles[i]);
        const audioPath = path.join(outputDir, `audio_${segId}.mp3`);
        const outputPath = path.join(outputDir, `final_${segId}.mp4`);

        if (!fs.existsSync(audioPath)) {
            console.log(`  Warning: audio_${segId}.mp3 not found`);
            continue;
        }

        console.log(`Segment ${segId}: ${webmFiles[i]} + audio_${segId}.mp3`);
        execSync(`ffmpeg -y -i "${webmPath}" -i "${audioPath}" -c:v libx264 -c:a aac -shortest "${outputPath}"`);
        mergedFiles.push(outputPath);
    }

    // Concatenate all segments
    console.log('\nConcatenating all segments...');
    const concatList = path.join(outputDir, 'concat_list.txt');
    fs.writeFileSync(concatList, mergedFiles.map(f => `file '${f}'`).join('\n'));
    execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${outputDir}/pitch_no_music.mp4"`);

    // Add background music
    console.log('Adding background music...');
    const bgMusic = '/Users/user1000/gitprojects/InstagramReelPoster/background_music.mp3';
    execSync(`ffmpeg -y -i "${outputDir}/pitch_no_music.mp4" -stream_loop -1 -i "${bgMusic}" -filter_complex "[1:a]volume=0.04[bg];[0:a][bg]amix=inputs=2:duration=first[a]" -map 0:v -map "[a]" -c:v copy -c:a aac "${outputDir}/zurich_pitch_final.mp4"`);

    // Final check
    const finalDuration = getAudioDuration(`${outputDir}/zurich_pitch_final.mp4`);
    console.log(`\n=== COMPLETE ===`);
    console.log(`Final video: ${outputDir}/zurich_pitch_final.mp4`);
    console.log(`Duration: ${finalDuration.toFixed(2)}s`);
}

main();
