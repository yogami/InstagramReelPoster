import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';
import { MediaStorageClient } from '../storage/MediaStorageClient';

/**
 * Renders video locally using FFmpeg.
 * Requires 'ffmpeg' to be installed in the system.
 */
export class FFmpegVideoRenderer implements IVideoRenderer {
    private readonly cloudinaryClient: MediaStorageClient;
    private readonly tempDir: string;

    constructor(cloudinaryClient: MediaStorageClient) {
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
        const videoPaths: string[] = [];

        const downloads = [
            this.downloadFile(manifest.voiceoverUrl, voiceoverPath),
            this.downloadFile(manifest.subtitlesUrl, subtitlesPath),
        ];

        if (manifest.musicUrl && musicPath) {
            downloads.push(this.downloadFile(manifest.musicUrl, musicPath));
        }

        if (manifest.animatedVideoUrls && manifest.animatedVideoUrls.length > 0) {
            for (let i = 0; i < manifest.animatedVideoUrls.length; i++) {
                const vidPath = path.join(jobDir, `video_${i}.mp4`);
                videoPaths.push(vidPath);
                downloads.push(this.downloadFile(manifest.animatedVideoUrls[i], vidPath));
            }
        } else if (manifest.animatedVideoUrl) {
            const vidPath = path.join(jobDir, 'source_video.mp4');
            videoPaths.push(vidPath);
            downloads.push(this.downloadFile(manifest.animatedVideoUrl, vidPath));
        } else if (manifest.segments) {
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
            videoPaths,
        };
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        // Handle data URLs (base64) specifically for subtitles
        if (url.startsWith('data:')) {
            const matches = url.match(new RegExp('^data:([A-Za-z-+/]+);base64,(.+)$'));
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
            videoPaths: string[];
        },
        outputPath: string
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const cmd = ffmpeg();

            // Input 0: Audio (Voiceover)
            cmd.input(assets.voiceoverPath);

            // Input 1 (Optional): Audio (Music)
            let visualInputOffset = 1;
            if (assets.musicPath) {
                cmd.input(assets.musicPath).inputOptions('-stream_loop -1');
                visualInputOffset = 2;
            }

            // Visual Inputs (Starting from visualInputOffset)
            const complexFilter: string[] = [];

            if (assets.videoPaths.length > 0) {
                // Video Source(s)
                if (assets.videoPaths.length === 1) {
                    // Single Video Source - loop it to ensure it covers full audio
                    cmd.input(assets.videoPaths[0]).inputOptions('-stream_loop -1');
                    const inputTag = `[${visualInputOffset}:v]`;
                    complexFilter.push(`${inputTag}scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[vbase]`);
                } else {
                    // Multiple video sources - concatenate them
                    assets.videoPaths.forEach(v => cmd.input(v));
                    let concatInputs = '';
                    assets.videoPaths.forEach((_, i) => {
                        const idx = visualInputOffset + i;
                        complexFilter.push(`[${idx}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p[v${i}]`);
                        concatInputs += `[v${i}]`;
                    });
                    complexFilter.push(`${concatInputs}concat=n=${assets.videoPaths.length}:v=1:a=0[vbase]`);
                }
            } else if (manifest.segments) {
                // Multi-Image Source
                assets.imagePaths.forEach((imgPath) => {
                    cmd.input(imgPath);
                });

                const imageInputs: string[] = [];
                assets.imagePaths.forEach((_, i) => {
                    const segment = manifest.segments![i];
                    const duration = segment.end - segment.start;
                    const inputTag = `[${i + visualInputOffset}:v]`;
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
            const subsFilter = `subtitles=${assets.subtitlesPath}:force_style='Fontname=Roboto,FontSize=24,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=1,Shadow=0,MarginV=60'`;
            complexFilter.push(`[vbase]${subsFilter}[vburned]`);

            // Mix Audio
            // Voiceover is [0:a], Music is [1:a] (if present)
            if (assets.musicPath) {
                complexFilter.push(`[1:a]volume=0.2[bq_music]`);
                complexFilter.push(`[0:a][bq_music]amix=inputs=2:duration=first[audio_out]`);
            } else {
                // No music, just use voiceover
                complexFilter.push(`[0:a]copy[audio_out]`);
            }

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
