import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { execSync } from 'child_process';
import { DialogueTimingMarker, ScenarioScript } from '../../domain/entities/ScenarioScript';
import { TTSResult } from '../../domain/ports/ITtsClient';

/**
 * ScenarioReelRenderer — composites a modern Instagram-style scenario reel.
 *
 * Visual layout (9:16, 1080×1920):
 * ┌──────────────────────────────┐
 * │                              │
 * │    [Moody illustrated bg]    │
 * │                              │
 * │          ┌──────┐            │
 * │          │ Cole │            │  ← Character name badge (centered)
 * │          └──────┘            │
 * │   "Define spark."            │  ← Dialogue text, clean sans-serif
 * │                              │
 * └──────────────────────────────┘
 *
 * - Single clean subtitle layer with character name + dialogue
 * - Large, readable white text with black outline
 * - Background image fills the entire frame
 */
export class ScenarioReelRenderer {
    private readonly renderDir: string;

    constructor() {
        this.renderDir = path.join(os.tmpdir(), 'scenario-reels');
        if (!fs.existsSync(this.renderDir)) {
            fs.mkdirSync(this.renderDir, { recursive: true });
        }
    }

    /**
     * Renders the complete scenario reel.
     */
    async render(params: {
        script: ScenarioScript;
        backgroundUrl: string;
        backgroundType: 'video' | 'image';
        audioSegments: TTSResult[];
        timingMarkers: DialogueTimingMarker[];
        totalDurationSeconds: number;
        musicUrl?: string;
    }): Promise<{ videoPath: string; durationSeconds: number }> {
        const jobId = uuidv4();
        const jobDir = path.join(this.renderDir, jobId);
        fs.mkdirSync(jobDir, { recursive: true });

        console.log(`[ScenarioRenderer] Starting render (bg: ${params.backgroundType}) in ${jobDir}...`);

        try {
            // 1. Download/copy background (video or image)
            const bgExt = params.backgroundType === 'video' ? 'mp4' : 'png';
            const bgPath = path.join(jobDir, `background.${bgExt}`);
            await this.downloadAsset(params.backgroundUrl, bgPath);

            // 2. Build combined voiceover audio
            const audioPath = path.join(jobDir, 'voiceover.mp3');
            await this.buildCombinedAudio(params.audioSegments, params.timingMarkers, jobDir, audioPath);

            // 3. Generate clean dialogue subtitle file
            const captionAssPath = path.join(jobDir, 'captions.ass');
            this.generateDialogueASS(params.script, params.timingMarkers, captionAssPath);

            // 4. Download music if provided
            let musicPath: string | null = null;
            if (params.musicUrl) {
                musicPath = path.join(jobDir, 'music.mp3');
                await this.downloadAsset(params.musicUrl, musicPath);
            }

            // 5. Render with FFmpeg
            const outputPath = path.join(jobDir, 'output.mp4');
            await this.runFFmpeg({
                bgPath,
                bgType: params.backgroundType,
                audioPath,
                captionAssPath,
                musicPath,
                totalDuration: params.totalDurationSeconds,
                outputPath,
            });

            console.log(`[ScenarioRenderer] Render complete: ${outputPath}`);
            return { videoPath: outputPath, durationSeconds: params.totalDurationSeconds };
        } catch (error) {
            console.error(`[ScenarioRenderer] Render failed:`, error);
            throw error;
        }
    }

    /**
     * Downloads an asset from URL, data URI, or copies a local file.
     */
    private async downloadAsset(url: string, dest: string): Promise<void> {
        if (url.startsWith('data:')) {
            const matches = url.match(/^data:[^;]+;base64,(.+)$/);
            if (matches) {
                fs.writeFileSync(dest, Buffer.from(matches[1], 'base64'));
                return;
            }
        }
        // Local file path
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            fs.copyFileSync(url, dest);
            return;
        }
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        fs.writeFileSync(dest, Buffer.from(response.data));
    }

    /**
     * Builds combined audio from individual TTS segments with natural pauses.
     */
    private async buildCombinedAudio(
        segments: TTSResult[],
        markers: DialogueTimingMarker[],
        jobDir: string,
        outputPath: string,
    ): Promise<void> {
        console.log(`[ScenarioRenderer] Concatenating ${segments.length} audio segments...`);

        const segmentPaths: string[] = [];
        for (let i = 0; i < segments.length; i++) {
            const segPath = path.join(jobDir, `seg_${i}.mp3`);
            await this.downloadAsset(segments[i].audioUrl, segPath);
            segmentPaths.push(segPath);
        }

        // 0.4s silence gap between lines at 24000Hz to match TTS sample rate
        const gapDuration = 0.4;
        const silencePath = path.join(jobDir, 'silence.mp3');
        execSync(
            `ffmpeg -y -f lavfi -i anullsrc=r=24000:cl=mono -t ${gapDuration} -c:a libmp3lame -q:a 9 "${silencePath}"`,
            { stdio: 'pipe' },
        );

        const listPath = path.join(jobDir, 'concat_list.txt');
        const listContent = segmentPaths
            .flatMap((p, i) => {
                const entries = [`file '${p}'`];
                if (i < segmentPaths.length - 1) {
                    entries.push(`file '${silencePath}'`);
                }
                return entries;
            })
            .join('\n');
        fs.writeFileSync(listPath, listContent);

        // Re-encode to normalize sample rates across all segments
        execSync(
            `ffmpeg -y -f concat -safe 0 -i "${listPath}" -ar 44100 -ac 1 -c:a libmp3lame -q:a 2 "${outputPath}"`,
            { stdio: 'pipe' },
        );

        console.log(`[ScenarioRenderer] Combined audio: ${outputPath}`);
    }

    /**
     * Generates premium Instagram-style dialogue captions.
     * 
     * Layout per line:
     *   COLE                    ← Character name in gold, all-caps badge
     *   "Define spark."         ← Dialogue in large bold white text with glow
     * 
     * Positioned center-bottom of the frame (safe zone for mobile viewing).
     * Uses fade-in effect for each line appearing.
     */
    private generateDialogueASS(
        script: ScenarioScript,
        markers: DialogueTimingMarker[],
        outputPath: string,
    ): void {
        const header = `[Script Info]
Title: Scenario Captions
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: CharName,Arial,42,&H0080CFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,4,0,3,0,0,2,40,40,360,1
Style: Dialogue,Arial,64,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,1,0,0,0,100,100,1,0,1,4,2,2,60,60,260,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text`;

        const events: string[] = [];

        for (const marker of markers) {
            const fadeMs = 150;
            const start = this.formatASSTime(marker.startTime);
            const end = this.formatASSTime(marker.endTime);

            // Character name badge (gold, all-caps, above dialogue)
            events.push(`Dialogue: 1,${start},${end},CharName,,0,0,0,,{\\fad(${fadeMs},0)}${marker.characterName.toUpperCase()}`);

            // Dialogue text (large white, bold, with shadow for readability)
            const dialogueText = `"${marker.text}"`;
            events.push(`Dialogue: 0,${start},${end},Dialogue,,0,0,0,,{\\fad(${fadeMs},0)}${dialogueText}`);
        }

        fs.writeFileSync(outputPath, header + '\n' + events.join('\n'));
    }

    /**
     * Runs FFmpeg composite: background (video/image) + audio + subtitles.
     */
    private async runFFmpeg(params: {
        bgPath: string;
        bgType: 'video' | 'image';
        audioPath: string;
        captionAssPath: string;
        musicPath: string | null;
        totalDuration: number;
        outputPath: string;
    }): Promise<void> {
        console.log(`[ScenarioRenderer] Running FFmpeg composite (bg: ${params.bgType})...`);

        // Escape paths for ASS filter
        const assPath = params.captionAssPath.replace(/'/g, "\\'").replace(/:/g, '\\:');

        let vf: string;
        let bgInputArgs: string;

        if (params.bgType === 'video') {
            // Video background: loop the clip, scale to 1080x1920, overlay subtitles
            bgInputArgs = `-stream_loop -1 -i "${params.bgPath}"`;
            vf = [
                `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920`,
                `ass='${assPath}'`,
            ].join(',');
        } else {
            // Image background: Ken Burns zoom + subtitles
            const totalFrames = Math.ceil((params.totalDuration + 0.5) * 30);
            bgInputArgs = `-loop 1 -i "${params.bgPath}"`;
            vf = [
                `zoompan=z='1+0.15*on/${totalFrames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${totalFrames}:s=1080x1920:fps=30`,
                `ass='${assPath}'`,
            ].join(',');
        }

        let audioFilter: string;
        let inputArgs: string;

        if (params.musicPath) {
            inputArgs = `${bgInputArgs} -i "${params.audioPath}" -stream_loop -1 -i "${params.musicPath}"`;
            audioFilter = `-filter_complex "[1:a]volume=1.0[voice];[2:a]volume=0.15[music];[voice][music]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]"`;
        } else {
            inputArgs = `${bgInputArgs} -i "${params.audioPath}"`;
            audioFilter = `-map 0:v -map 1:a`;
        }

        const cmd = [
            `ffmpeg -y`,
            inputArgs,
            `-vf "${vf}"`,
            audioFilter,
            `-c:v libx264 -preset medium -crf 23`,
            `-c:a aac -b:a 192k`,
            `-r 30 -pix_fmt yuv420p`,
            `-t ${params.totalDuration + 0.5}`,
            `-shortest`,
            `"${params.outputPath}"`,
        ].join(' ');

        console.log(`[ScenarioRenderer] FFmpeg cmd: ${cmd.substring(0, 200)}...`);
        execSync(cmd, { stdio: 'pipe', timeout: 300_000 });
    }

    /**
     * Formats seconds as ASS timestamp: H:MM:SS.CC
     */
    private formatASSTime(seconds: number): string {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        const cs = Math.round((seconds % 1) * 100);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    }
}
