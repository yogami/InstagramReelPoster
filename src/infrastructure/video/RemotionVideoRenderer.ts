import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import SrtParser from 'srt-parser-2';
import { IVideoRenderer, RenderResult } from '../../domain/ports/IVideoRenderer';
import { ReelManifest } from '../../domain/entities/ReelManifest';

/**
 * Renders video locally using Remotion.
 * Expects 'remotion-kundalini' to be inside the project root
 */
export class RemotionVideoRenderer implements IVideoRenderer {
    private readonly remotionDir: string;
    private readonly renderDir: string;

    constructor() {
        this.remotionDir = path.join(process.cwd(), 'remotion-kundalini');
        this.renderDir = path.join(process.cwd(), 'public', 'renders');
        if (!fs.existsSync(this.renderDir)) {
            fs.mkdirSync(this.renderDir, { recursive: true });
        }
    }

    private async downloadSubtitles(url: string): Promise<string> {
        if (!url) return "";
        // If it's a data URL, decode it directly
        if (url.startsWith('data:')) {
            const match = url.match(/^data:([A-Za-z0-9\-+/]+)(;base64)?,(.+)$/);
            if (match && match.length >= 4) {
                if (match[2] === ';base64') {
                    return Buffer.from(match[3], 'base64').toString('utf8');
                }
                return decodeURIComponent(match[3]);
            }
            return "";
        }

        try {
            const resp = await axios.get(url.startsWith('turbo:') ? url.substring(6) : url);
            return resp.data as string;
        } catch (e) {
            console.error('[Remotion] Failed to download subtitles:', e);
            return "";
        }
    }

    async render(manifest: ReelManifest): Promise<RenderResult> {
        const jobId = uuidv4();
        const jobDir = path.join(os.tmpdir(), `reel-job-${jobId}`);
        fs.mkdirSync(jobDir, { recursive: true });

        try {
            console.log(`[Remotion] Starting render job ${jobId}`);

            // 1. Fetch and Parse Subtitles
            const srtContent = await this.downloadSubtitles(manifest.subtitlesUrl);
            const parser = new SrtParser();
            const subtitlesData = srtContent ? parser.fromSrt(srtContent) : [];

            // Convert raw SRT format to something Remotion can easily digest (seconds)
            const captions = subtitlesData.map(sub => ({
                startSeconds: sub.startSeconds,
                endSeconds: sub.endSeconds,
                text: sub.text.replace(/\n/g, ' ')
            }));

            // 2. Convert Segment Timing
            const segments = manifest.segments?.map((seg) => {
                const start = seg.start ?? (seg as any).startTime ?? (seg as any).startSeconds ?? 0;
                const end = seg.end ?? (seg as any).endTime ?? (seg as any).endSeconds ?? 0;
                return {
                    image: seg.imageUrl || "",
                    durationSec: end - start,
                    zoomEffect: seg.zoomEffect || "static"
                };
            }) || [];

            // 3. Build Global Props
            const remotionData = {
                fps: 30,
                audioVolume: 1.0,
                musicVolume: 0.35,
                voiceover: manifest.voiceoverUrl || "",
                music: manifest.musicUrl || "",
                segments: segments,
                captions: captions,
                branding: manifest.branding
            };

            const dataFilePath = path.join(jobDir, 'remotion-data.json');
            fs.writeFileSync(dataFilePath, JSON.stringify(remotionData, null, 2));

            console.log("=== REMOTION DATA PROPS ===");
            console.log(JSON.stringify(remotionData, null, 2));
            console.log("===========================");

            // 4. Build Remotion render command
            const finalFileName = `reel_${jobId}.mp4`;
            const outputPath = path.join(this.renderDir, finalFileName);

            console.log(`[Remotion] Executing Remotion render...`);

            // Note: npm must be installed inside remotion-kundalini for this to work
            const cmd = `npx remotion render src/index.ts DynamicReel "${outputPath}" --props="${dataFilePath}"`;

            execSync(cmd, {
                cwd: this.remotionDir,
                stdio: 'inherit'
            });

            const videoUrl = `/renders/${finalFileName}`;
            console.log(`[Remotion] Render complete: ${videoUrl}`);

            return {
                videoUrl,
                renderId: jobId,
                // Add the absolute local path so the UploadStep can read the file
                localVideoPath: outputPath
            };
        } catch (error: any) {
            console.error(`[Remotion] Render failed: ${error.message || 'Unknown error'}`);
            throw error;
        } finally {
            try {
                // fs.rmSync(jobDir, { recursive: true, force: true });
                console.log(`[Remotion] Left temp dir ${jobDir} for debugging.`);
            } catch (e) {
                console.warn(`[Remotion] Failed to cleanup temp dir ${jobDir}`, e);
            }
        }
    }
}
