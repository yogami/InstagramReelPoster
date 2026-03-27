import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { FishAudioTtsClient } from '../../../../infrastructure/tts/FishAudioTtsClient';
import Replicate from 'replicate';

export interface StillscapeAct {
    id: string;
    narration: string;
    visualPrompt: string;
    typography: { text: string; color: string }[];
}

export interface StillscapeConfig {
    fishVoiceId?: string;
    replicateApiToken: string;
    fishApiKey: string;
    cloudinaryCloudName: string;
    cloudinaryApiKey: string;
    cloudinaryApiSecret: string;
    makeWebhookUrl: string;
    makeApiKey: string;
}

export class SovereignStillscapeEngine {
    private readonly config: StillscapeConfig;
    private readonly replicate: Replicate;
    private readonly ttsClient: FishAudioTtsClient;
    private readonly tmpDir = '/tmp/sovereign_stillscape';

    constructor(config: StillscapeConfig) {
        this.config = config;
        this.replicate = new Replicate({ auth: config.replicateApiToken });
        this.ttsClient = new FishAudioTtsClient(
            config.fishApiKey, 
            config.fishVoiceId || "716594c03801446bb87a964a1c2a5895"
        );

        if (fs.existsSync(this.tmpDir)) {
            fs.rmSync(this.tmpDir, { recursive: true, force: true });
        }
        fs.mkdirSync(this.tmpDir, { recursive: true });
    }

    private async downloadFile(url: string, dest: string): Promise<void> {
        const res = await axios.get(url, { responseType: 'stream' });
        const writer = fs.createWriteStream(dest);
        res.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    }

    private getDuration(filePath: string): number {
        const result = execSync(`ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`).toString().trim();
        return parseFloat(result);
    }

    private async generateFluxImage(prompt: string): Promise<string> {
        console.log(`[Engine: FLUX] Generating visual for: "${prompt.substring(0, 50)}..."`);
        const output: any = await this.replicate.run("black-forest-labs/flux-schnell", {
            input: {
                prompt: prompt + ", vertical aspect ratio 9:16, cinematic lighting, photorealistic, 8k resolution, highly detailed",
                aspect_ratio: "9:16",
                output_format: "png",
                output_quality: 100
            }
        });

        if (Array.isArray(output) && output.length > 0) return output[0];
        if (typeof output === 'string') return output;
        if(output && output.url()) return output.url();
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
        
        const randomFile = files[Math.floor(Math.random() * files.length)];
        return path.join(vaultDir, randomFile);
    }

    public async execute(jobId: string, caption: string, acts: StillscapeAct[]): Promise<string> {
        console.log(`\n=== 🚀 Initiating Sovereign Stillscape Engine for Job: ${jobId} ===\n`);
        const actVideoPaths: string[] = [];

        for (const act of acts) {
            console.log(`--- Building Act: ${act.id} ---`);
            
            // 1. Synthesize Audio
            const ttsResult = await this.ttsClient.synthesize(act.narration);
            const audioPath = path.join(this.tmpDir, `${act.id}_narration.mp3`);
            fs.writeFileSync(audioPath, Buffer.from(ttsResult.audioUrl.split(',')[1], 'base64'));
            const exactDuration = this.getDuration(audioPath);
            console.log(`[Engine: TTS] Audio length locked: ${exactDuration}s`);

            // 2. Generate Cinematic Visual
            let imageUrl = "";
            try {
                imageUrl = await this.generateFluxImage(act.visualPrompt);
            } catch (err: any) {
                console.error(`[Engine: Replicate] Warning - FLUX Generation failed: ${err.message}. Retrying in 10s...`);
                await new Promise(r => setTimeout(r, 10000));
                imageUrl = await this.generateFluxImage(act.visualPrompt);
            }

            const imagePath = path.join(this.tmpDir, `${act.id}_raw.png`);
            await this.downloadFile(imageUrl, imagePath);

            // 3. Composite Act (Ken Burns + Typography)
            const actVideoPath = path.join(this.tmpDir, `${act.id}_compiled.mp4`);
            let drawtext = "";
            act.typography.forEach((w, index) => {
                const yOffset = (index - act.typography.length/2) * 120;
                drawtext += `drawtext=text='${w.text}':fontcolor=${w.color}:fontsize=90:fontfile=/System/Library/Fonts/Impact.ttf:x=(w-text_w)/2:y=(h-text_h)/2+${yOffset}:shadowcolor=black:shadowx=4:shadowy=4,`;
            });
            if (drawtext.length > 0) drawtext = drawtext.slice(0, -1);

            const zoompan = `zoompan=z='min(zoom+0.0015,1.5)':d=${Math.ceil(exactDuration*25)}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920`;

            const filterComplex = drawtext 
                ? `-vf "scale=1080.0:1920.0,${zoompan},${drawtext.replace(/fontfile=[^:]+:/, '')}"`
                : `-vf "scale=1080.0:1920.0,${zoompan}"`;

            console.log(`[Engine: Compositor] Merging visual mechanics for ${act.id}...`);
            const cmd = `ffmpeg -y -loop 1 -i "${imagePath}" -i "${audioPath}" ` +
                        `${filterComplex} ` + 
                        `-c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest -t ${exactDuration} "${actVideoPath}" -loglevel error`;

            execSync(cmd);
            actVideoPaths.push(actVideoPath);

            // Throttle Replicate API defensively
            console.log(`[Engine: Gateway] Cooldown 7s...`);
            await new Promise(r => setTimeout(r, 7000));
        }

        // 4. Concat all acts
        console.log(`\n[Engine: Orchestrator] Assembling ${actVideoPaths.length} acts into sequence...`);
        const concatList = path.join(this.tmpDir, 'list.txt');
        const listContent = actVideoPaths.map(p => `file '${p}'`).join('\n');
        fs.writeFileSync(concatList, listContent);
        
        const rawCompositionResult = path.join(this.tmpDir, `${jobId}_composition.mp4`);
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${rawCompositionResult}" -loglevel error`);

        // 5. Inject Vibe Vault Audio Layer
        const vibeTrack = this.getVibeVaultTrack();
        const finalVideoPath = path.join(this.tmpDir, `${jobId}_final.mp4`);
        
        if (vibeTrack) {
            console.log(`[Engine: VibeVault] Injecting atmospheric resonance: ${path.basename(vibeTrack)}`);
            // Duck background audio to 15%, merge with primary narration without extending video length
            const mixCmd = `ffmpeg -y -i "${rawCompositionResult}" -stream_loop -1 -i "${vibeTrack}" ` +
                           `-filter_complex "[1:a]volume=0.15[bg];[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" ` +
                           `-map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest "${finalVideoPath}" -loglevel error`;
            execSync(mixCmd);
        } else {
            console.warn(`[Engine: VibeVault] No drone tracks found. Proceeding with flat narration.`);
            fs.copyFileSync(rawCompositionResult, finalVideoPath);
        }

        // 6. Upload Platform Asset
        console.log(`\n[Engine: Distribution] Provisioning asset to Cloudinary CDN...`);
        const cloudinary = require('cloudinary').v2;
        cloudinary.config({
            cloud_name: this.config.cloudinaryCloudName,
            api_key: this.config.cloudinaryApiKey,
            api_secret: this.config.cloudinaryApiSecret
        });

        const res = await cloudinary.uploader.upload(finalVideoPath, {
            resource_type: "video",
            public_id: `${jobId}`
        });
        console.log(`[Engine: Distribution] Asset provisioned: ${res.secure_url}`);

        // 7. Dispatch to Webhook (Instagram) — only if a webhook URL is configured
        if (this.config.makeWebhookUrl) {
            console.log(`[Engine: Distribution] Dispatching Webhook to Make.com...`);
            const payload = {
                jobId: jobId,
                status: 'completed',
                caption: caption,
                video_url: res.secure_url,
                url: res.secure_url,
                videoUrl: res.secure_url,
                metadata: {
                    createdAt: new Date(),
                    completedAt: new Date(),
                    test: false
                }
            };

            const whResponse = await axios.post(this.config.makeWebhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'x-make-apikey': this.config.makeApiKey
                }
            });
            console.log(`✅ [Engine: SovereignStillscape] Execution Completed. Hook Status: ${whResponse.status}`);
        } else {
            console.log(`[Engine: Distribution] No webhook URL configured — skipping Make.com dispatch. ReelOrchestrator will handle posting.`);
        }

        return res.secure_url;
    }
}
