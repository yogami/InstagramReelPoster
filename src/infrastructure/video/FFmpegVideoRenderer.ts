import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';
import { CloudinaryStorageClient } from '../storage/CloudinaryStorageClient';

/**
 * Renders video locally using FFmpeg.
 * Requires 'ffmpeg' to be installed in the system.
 */
export class FFmpegVideoRenderer implements IVideoRenderer {
    private readonly cloudinaryClient: CloudinaryStorageClient;
    private readonly tempDir: string;

    constructor(cloudinaryClient: CloudinaryStorageClient) {
        this.cloudinaryClient = cloudinaryClient;
        this.tempDir = path.join(os.tmpdir(), 'reel-poster-renders');
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    async render(manifest: ReelManifest): Promise<RenderResult> {
        const jobId = uuidv4();
        const jobDir = path.join(this.tempDir, jobId);
        fs.mkdirSync(jobDir, { recursive: true });

        try {
            console.log(`[FFmpeg] Starting render job ${jobId}`);

            // 1. Download all assets
            console.log(`[FFmpeg] Downloading assets for ${jobId}...`);
            const assets = await this.downloadAssets(manifest, jobDir);

            // 2. Build and run FFmpeg command
            console.log(`[FFmpeg] Processing video...`);
            const outputPath = path.join(jobDir, 'output.mp4');
            await this.runFFmpeg(manifest, assets, outputPath);

            // 3. Upload to Cloudinary
            console.log(`[FFmpeg] Uploading result...`);
            const uploadResult = await this.cloudinaryClient.uploadFromUrl(outputPath, {
                folder: 'instagram-reels/renders',
                publicId: `reel_${jobId}`,
                resourceType: 'video',
            });

            return {
                videoUrl: uploadResult.url,
                renderId: jobId,
            };
        } catch (error) {
            console.error(`[FFmpeg] Render failed:`, error);
            throw error;
        } finally {
            // 4. Cleanup
            try {
                fs.rmSync(jobDir, { recursive: true, force: true });
            } catch (e) {
                console.warn(`[FFmpeg] Failed to cleanup temp dir ${jobDir}`, e);
            }
        }
    }

    private async downloadAssets(manifest: ReelManifest, jobDir: string) {
        const voiceoverPath = path.join(jobDir, 'voiceover.mp3');
        const musicPath = path.join(jobDir, 'music.mp3');
        const subtitlesPath = path.join(jobDir, 'subtitles.srt');
        const imagePaths: string[] = [];

        const downloads = [
            this.downloadFile(manifest.voiceoverUrl, voiceoverPath),
            this.downloadFile(manifest.musicUrl, musicPath),
            this.downloadFile(manifest.subtitlesUrl, subtitlesPath),
        ];

        // Download images
        for (let i = 0; i < manifest.segments.length; i++) {
            const imgPath = path.join(jobDir, `image_${i}.png`);
            imagePaths.push(imgPath);
            downloads.push(this.downloadFile(manifest.segments[i].imageUrl, imgPath));
        }

        await Promise.all(downloads);

        return {
            voiceoverPath,
            musicPath,
            subtitlesPath,
            imagePaths,
        };
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        // Handle data URLs (base64) specifically for subtitles
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const buffer = Buffer.from(matches[2], 'base64');
                fs.writeFileSync(dest, buffer);
                return;
            }
            throw new Error('Invalid data URL');
        }

        const writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    private runFFmpeg(
        manifest: ReelManifest,
        assets: {
            voiceoverPath: string;
            musicPath: string;
            subtitlesPath: string;
            imagePaths: string[];
        },
        outputPath: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = ffmpeg();

            // Input 0: Audio (Voiceover)
            cmd.input(assets.voiceoverPath);

            // Input 1: Audio (Music)
            cmd.input(assets.musicPath);

            // Inputs 2...N: Images
            assets.imagePaths.forEach((imgPath) => {
                cmd.input(imgPath);
            });

            // Filter Graph logic
            const complexFilter: string[] = [];
            const imageInputs: string[] = [];

            // Process images (Loop, Scale, Crop, Trim)
            assets.imagePaths.forEach((_, i) => {
                const segment = manifest.segments[i];
                const duration = segment.end - segment.start;
                const inputTag = `[${i + 2}:v]`; // Images start at index 2
                const outputTag = `[v${i}]`;

                // Filter chain for this image:
                // 1. Loop image
                // 2. Scale and crop to 9:16 (1080x1920)
                // 3. Set pixel format
                // 4. Trim to duration
                // 5. Fade out (last 0.5s) if not last segment
                // NOTE: 'loop' option in fluent-ffmpeg input options is simpler, but let's use filters for precision

                // We use -loop 1 input option for images, then trim in filter
                cmd.inputOptions([`-loop 1`, `-t ${duration}`]);

                complexFilter.push(
                    `${inputTag}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,format=yuv420p${outputTag}`
                );
                imageInputs.push(outputTag);

                // Note: transitions and complex concurrency are hard in basic ffmpeg.
                // We will just do a hard cut concat for V1 to be safe, fast and reliable.
                // Advanced transitions (crossfade) require complex offset math.
            });

            // Concat video segments
            const concatInput = imageInputs.join('');
            complexFilter.push(`${concatInput}concat=n=${imageInputs.length}:v=1:a=0[vbase]`);

            // Burn subtitles into video
            // Escape path for windows compatibility (though we run on linux usually)
            // and ensure styling.
            // Using 'force_style' to ensure visibility.
            const subsFilter = `subtitles=${assets.subtitlesPath}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'`;

            complexFilter.push(`[vbase]${subsFilter}[vburned]`);

            // Mix Audio
            // [0:a] is voiceover (keep volume 1.0)
            // [1:a] is music (lower volume 0.2)
            // amix mixes them. 'duration=first' matches voiceover length (roughly)
            // Actually we want duration of the video.
            complexFilter.push(`[1:a]volume=0.2[bq_music]`);
            complexFilter.push(`[0:a][bq_music]amix=inputs=2:duration=first[audio_out]`);

            cmd.complexFilter(complexFilter, ['vburned', 'audio_out']);

            cmd.outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-pix_fmt yuv420p',
                '-shortest', // Stop when shortest stream ends (usually audio)
                '-movflags +faststart' // Web optimized
            ]);

            cmd.save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)));
        });
    }
}
