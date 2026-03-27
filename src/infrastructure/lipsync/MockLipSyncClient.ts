import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { ILipSyncClient, LipSyncParams, LipSyncResult } from '../../domain/ports/ILipSyncClient';

/**
 * Mock lip-sync client using FFmpeg.
 * Overlays the static character image with audio to create a simple video.
 * Zero cost — used for testing the pipeline end-to-end without API calls.
 *
 * The output won't have animated lip movements, but it validates:
 * - Pipeline timing and flow
 * - Audio/video sync
 * - Caption overlay and compositing
 * - Upload to Cloudinary
 */
export class MockLipSyncClient implements ILipSyncClient {
    async generateLipSync(params: LipSyncParams): Promise<LipSyncResult> {
        const { imagePath, audioPath, durationSeconds, characterName } = params;

        const outputDir = path.join(os.tmpdir(), `mock-lipsync-${Date.now()}`);
        fs.mkdirSync(outputDir, { recursive: true });
        const outputPath = path.join(outputDir, 'lipsync_mock.mp4');

        console.log(`[MockLipSync] Generating mock video for "${characterName || 'character'}" (${durationSeconds}s)`);

        // Create a video from the static image + audio using FFmpeg
        // -loop 1: loop the image to fill the duration
        // -shortest: stop when the shorter stream (audio) ends
        // -tune stillimage: optimize for static image content
        const cmd = [
            'ffmpeg -y',
            `-loop 1 -i "${imagePath}"`,
            `-i "${audioPath}"`,
            '-c:v libx264 -tune stillimage -pix_fmt yuv420p',
            '-c:a aac -b:a 192k',
            `-t ${durationSeconds}`,
            '-shortest',
            '-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black"',
            `"${outputPath}"`,
        ].join(' ');

        try {
            execSync(cmd, { timeout: 60000, stdio: 'pipe' });
        } catch (err: any) {
            throw new Error(`MockLipSync FFmpeg failed: ${err.stderr?.toString() || err.message}`);
        }

        // Get actual duration via ffprobe
        let actualDuration = durationSeconds;
        try {
            const probe = execSync(
                `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`,
                { stdio: 'pipe' }
            ).toString().trim();
            actualDuration = parseFloat(probe) || durationSeconds;
        } catch { /* use fallback */ }

        console.log(`[MockLipSync] Mock video generated: ${outputPath} (${actualDuration.toFixed(1)}s)`);

        return {
            videoPath: outputPath,
            durationSeconds: actualDuration,
        };
    }
}
