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
        const musicPath = manifest.musicUrl ? path.join(jobDir, 'music.mp3') : null;
        const subtitlesPath = path.join(jobDir, 'subtitles.srt');
        const imagePaths: string[] = [];
        let animatedVideoPath: string | null = null;

        const downloads = [
            this.downloadFile(manifest.voiceoverUrl, voiceoverPath),
            this.downloadFile(manifest.subtitlesUrl, subtitlesPath),
        ];

        // Download music only if available
        if (manifest.musicUrl && musicPath) {
            downloads.push(this.downloadFile(manifest.musicUrl, musicPath));
        }

        // Branch: Animated Video vs Images
        if (manifest.animatedVideoUrl) {
            animatedVideoPath = path.join(jobDir, 'source_video.mp4');
            downloads.push(this.downloadFile(manifest.animatedVideoUrl, animatedVideoPath));
        } else if (manifest.segments) {
            // Download images
            for (let i = 0; i < manifest.segments.length; i++) {
                const imgPath = path.join(jobDir, `image_${i}.png`);
                imagePaths.push(imgPath);
                downloads.push(this.downloadFile(manifest.segments[i].imageUrl, imgPath));
            }
        }

        await Promise.all(downloads);

        return {
            voiceoverPath,
            musicPath,
            subtitlesPath,
            imagePaths,
            animatedVideoPath,
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
            musicPath: string | null;
            subtitlesPath: string;
            imagePaths: string[];
            animatedVideoPath?: string | null;
        },
        outputPath: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = ffmpeg();

            // Input 0: Audio (Voiceover)
            cmd.input(assets.voiceoverPath);

            // Input 1: Audio (Music) - only if available
            if (assets.musicPath) {
                cmd.input(assets.musicPath).inputOptions('-stream_loop -1');
            }

            // Inputs 2...N: Video source
            const complexFilter: string[] = [];
            let vbaseTag = '[vbase]';

            if (assets.animatedVideoPath) {
                // Input 2: The animated video
                cmd.input(assets.animatedVideoPath);
                // Ensure it's scaled to 1080:1920 just in case
                complexFilter.push(`[2:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vbase]`);
            } else if (manifest.segments) {
                // Inputs 2...N: Images
                assets.imagePaths.forEach((imgPath) => {
                    cmd.input(imgPath);
                });

                const imageInputs: string[] = [];
                assets.imagePaths.forEach((_, i) => {
                    const segment = manifest.segments![i];
                    const duration = segment.end - segment.start;
                    const inputTag = `[${i + 2}:v]`; // Images start at index 2
                    const outputTag = `[v${i}]`;

                    // We use -loop 1 input option for images, then trim in filter
                    cmd.inputOptions([`-loop 1`, `-t ${duration}`]);

                    complexFilter.push(
                        `${inputTag}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p${outputTag}`
                    );
                    imageInputs.push(outputTag);
                });

                // Concat video segments
                const concatInput = imageInputs.join('');
                complexFilter.push(`${concatInput}concat=n=${imageInputs.length}:v=1:a=0[vbase]`);
            } else {
                return reject(new Error('Manifest has neither segments nor animatedVideoUrl'));
            }

            // Burn subtitles into video
            const subsFilter = `subtitles=${assets.subtitlesPath}:force_style='FontName=Arial,FontSize=24,PrimaryColour=&H00FFFFFF,BackColour=&H80000000,BorderStyle=3,Outline=1,Shadow=0,MarginV=60'`;
            complexFilter.push(`[vbase]${subsFilter}[vburned]`);

            // Mix Audio
            complexFilter.push(`[1:a]volume=0.2[bq_music]`);
            complexFilter.push(`[0:a][bq_music]amix=inputs=2:duration=first[audio_out]`);

            cmd.complexFilter(complexFilter, ['vburned', 'audio_out']);

            cmd.outputOptions([
                '-c:v libx264',
                '-c:a aac',
                '-pix_fmt yuv420p',
                '-shortest',
                '-movflags +faststart'
            ]);

            cmd.save(outputPath)
                .on('end', () => resolve())
                .on('error', (err) => reject(new Error(`FFmpeg error: ${err.message}`)));
        });
    }
}
