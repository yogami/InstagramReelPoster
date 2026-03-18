import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { FishAudioTtsClient } from '../../../../infrastructure/tts/FishAudioTtsClient';
import Replicate from 'replicate';
import { PuppetDialogueTurn } from '../../../../application/services/PuppetDialogueGenerator';

export interface PuppetEngineConfig {
    fishApiKey: string;
    fishMaleVoiceId: string;
    fishFemaleVoiceId: string;
    replicateApiToken: string;
    cloudinaryCloudName: string;
    cloudinaryApiKey: string;
    cloudinaryApiSecret: string;
    makeWebhookUrl: string;
    makeApiKey: string;
}

interface TimelineTurn {
    speaker: 'marco' | 'luna';
    line: string;
    audioFile: string;
    startFrame: number;
    durationFrames: number;
}

export class SovereignPuppetEngine {
    private readonly config: PuppetEngineConfig;
    private readonly replicate: Replicate;
    private readonly maleTts: FishAudioTtsClient;
    private readonly femaleTts: FishAudioTtsClient;
    private readonly tmpDir = '/tmp/sovereign_puppet';
    private readonly remotionDir: string;

    constructor(config: PuppetEngineConfig) {
        this.config = config;
        this.replicate = new Replicate({ auth: config.replicateApiToken });
        this.maleTts = new FishAudioTtsClient(config.fishApiKey, config.fishMaleVoiceId);
        this.femaleTts = new FishAudioTtsClient(config.fishApiKey, config.fishFemaleVoiceId);
        this.remotionDir = path.resolve(process.cwd(), 'scripts/remotion-puppet');

        if (fs.existsSync(this.tmpDir)) {
            fs.rmSync(this.tmpDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.tmpDir, { recursive: true });
    }

    private getDuration(filePath: string): number {
        const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`).toString().trim();
        return parseFloat(result);
    }

    private async generateFluxImage(prompt: string): Promise<string> {
        console.log(`[Puppet:FLUX] Generating background: "${prompt.substring(0, 60)}..."`);
        const output: any = await this.replicate.run("black-forest-labs/flux-schnell", {
            input: {
                prompt: prompt + ", vertical aspect ratio 9:16, cinematic lighting, photorealistic, 8k resolution",
                aspect_ratio: "9:16",
                output_format: "png",
                output_quality: 100
            }
        });

        if (Array.isArray(output) && output.length > 0) return output[0];
        if (typeof output === 'string') return output;
        if (output && output.url()) return output.url();
        if (output && typeof output.toString === 'function' && output.toString().startsWith('http')) {
            return output.toString();
        }
        throw new Error(`Failed to parse FLUX output: ${JSON.stringify(output)}`);
    }

    private getVibeVaultTrack(): string | null {
        const vaultDir = path.resolve(process.cwd(), 'src/assets/audio/drones');
        if (!fs.existsSync(vaultDir)) return null;
        const files = fs.readdirSync(vaultDir).filter(f => f.endsWith('.mp3') || f.endsWith('.wav'));
        if (files.length === 0) return null;
        return path.join(vaultDir, files[Math.floor(Math.random() * files.length)]);
    }

    /**
     * Execute the full puppet dialogue video pipeline.
     */
    public async execute(
        jobId: string,
        caption: string,
        visualPrompt: string,
        turns: PuppetDialogueTurn[]
    ): Promise<string> {
        console.log(`\n=== 🎭 Initiating Sovereign Puppet Engine for Job: ${jobId} ===\n`);

        const publicDir = path.join(this.remotionDir, 'public');
        
        // 1. Generate TTS audio for each dialogue turn
        console.log(`--- Step 1: Generating Fish Audio TTS for ${turns.length} turns ---`);
        const timeline: TimelineTurn[] = [];
        let currentFrame = 15; // Start with a brief pause
        const FPS = 30;
        const GAP_FRAMES = 12; // 0.4s gap between turns

        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const ttsClient = turn.speaker === 'marco' ? this.maleTts : this.femaleTts;
            
            console.log(`[Puppet:TTS] Turn ${i + 1}: ${turn.speaker} — "${turn.line.substring(0, 40)}..."`);
            const ttsResult = await ttsClient.synthesize(turn.line);

            // Write audio to the Remotion public dir so staticFile() can access it
            const audioFilename = `puppet_${jobId}_turn${i}.mp3`;
            const audioPath = path.join(publicDir, audioFilename);
            fs.writeFileSync(audioPath, Buffer.from(ttsResult.audioUrl.split(',')[1], 'base64'));

            const durationSec = this.getDuration(audioPath);
            const durationFrames = Math.ceil(durationSec * FPS);

            timeline.push({
                speaker: turn.speaker,
                line: turn.line,
                audioFile: audioFilename,
                startFrame: currentFrame,
                durationFrames,
            });

            console.log(`   → ${durationSec.toFixed(1)}s (${durationFrames} frames, start: ${currentFrame})`);
            currentFrame += durationFrames + GAP_FRAMES;
        }

        // 2. Generate background image
        console.log(`\n--- Step 2: Generating FLUX background ---`);
        let bgImageUrl = '';
        try {
            bgImageUrl = await this.generateFluxImage(visualPrompt);
        } catch (err: any) {
            console.error(`[Puppet:FLUX] Warning — retrying in 10s: ${err.message}`);
            await new Promise(r => setTimeout(r, 10000));
            bgImageUrl = await this.generateFluxImage(visualPrompt);
        }

        // Download background to Remotion public dir
        const bgFilename = `puppet_${jobId}_bg.png`;
        const bgPath = path.join(publicDir, bgFilename);
        const bgRes = await axios.get(bgImageUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(bgPath, bgRes.data);
        console.log(`[Puppet:FLUX] Background saved: ${bgFilename}`);

        // 3. Write timeline.json for the composition
        const timelineFile = path.join(publicDir, `puppet_${jobId}_timeline.json`);
        fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2));

        // 4. Render via Remotion CLI
        console.log(`\n--- Step 3: Rendering via Remotion CLI ---`);
        const outputPath = path.join(this.tmpDir, `${jobId}_puppet_raw.mp4`);
        const inputProps = {
            timeline,
            backgroundUrl: bgFilename,
        };

        // Write props to a file to avoid shell quoting issues
        const propsFile = path.join(this.tmpDir, `${jobId}_props.json`);
        fs.writeFileSync(propsFile, JSON.stringify(inputProps));

        const renderCmd = `cd "${this.remotionDir}" && npx remotion render PuppetDialogue "${outputPath}" --props="${propsFile}" --log=error`;

        console.log(`[Puppet:Remotion] Executing render...`);
        execSync(renderCmd, { stdio: 'pipe', timeout: 120_000 });
        console.log(`[Puppet:Remotion] Render complete: ${outputPath}`);

        // 5. Vibe Vault background music
        const vibeTrack = this.getVibeVaultTrack();
        const finalVideoPath = path.join(this.tmpDir, `${jobId}_puppet_final.mp4`);

        if (vibeTrack) {
            console.log(`[Puppet:VibeVault] Injecting: ${path.basename(vibeTrack)}`);
            const mixCmd = `ffmpeg -y -i "${outputPath}" -stream_loop -1 -i "${vibeTrack}" ` +
                `-filter_complex "[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" ` +
                `-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoPath}" -loglevel error`;
            execSync(mixCmd);
        } else {
            fs.copyFileSync(outputPath, finalVideoPath);
        }

        // 6. Upload to Cloudinary
        console.log(`\n--- Step 4: Uploading to Cloudinary ---`);
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
            cloud_name: this.config.cloudinaryCloudName,
            api_key: this.config.cloudinaryApiKey,
            api_secret: this.config.cloudinaryApiSecret,
        });

        const res = await cloudinary.uploader.upload(finalVideoPath, {
            resource_type: "video",
            public_id: `puppet_${jobId}`,
        });
        console.log(`[Puppet:CDN] Uploaded: ${res.secure_url}`);

        // 7. Webhook dispatch
        if (this.config.makeWebhookUrl) {
            console.log(`[Puppet:Webhook] Dispatching to Make.com...`);
            const payload = {
                jobId,
                status: 'completed',
                caption,
                video_url: res.secure_url,
                url: res.secure_url,
                videoUrl: res.secure_url,
                metadata: { createdAt: new Date(), completedAt: new Date(), test: false, engine: 'puppet' },
            };
            const whRes = await axios.post(this.config.makeWebhookUrl, payload, {
                headers: { 'Content-Type': 'application/json', 'x-make-apikey': this.config.makeApiKey },
            });
            console.log(`✅ [Puppet Engine] Complete. Webhook: ${whRes.status}`);
        } else {
            console.log(`[Puppet:Webhook] No webhook URL — skipping.`);
        }

        // 8. Cleanup Remotion public dir (remove temp audio/bg files)
        for (const f of fs.readdirSync(publicDir)) {
            if (f.startsWith(`puppet_${jobId}_`)) {
                fs.unlinkSync(path.join(publicDir, f));
            }
        }

        return res.secure_url;
    }
}
