import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { execSync } from 'child_process';
import { FishAudioTtsClient } from '../../../../infrastructure/tts/FishAudioTtsClient';
import Replicate from 'replicate';
import { PuppetDialogueTurn } from '../../../../application/services/PuppetDialogueGenerator';
import { KieAvatarClient } from '../../../../infrastructure/video/KieAvatarClient';

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
    kieApiKey?: string;
    kieApiBaseUrl?: string;
}

interface TimelineTurn {
    speaker: 'marco' | 'luna';
    line: string;
    audioFile: string;
    startFrame: number;
    durationFrames: number;
    emotion: string;
}

export class SovereignPuppetEngine {
    private readonly config: PuppetEngineConfig;
    private readonly replicate: Replicate;
    private readonly maleTts: FishAudioTtsClient;
    private readonly femaleTts: FishAudioTtsClient;
    private readonly tmpDir = '/tmp/sovereign_puppet';
    private readonly remotionDir: string;
    private readonly kieAvatar: KieAvatarClient | null;

    constructor(config: PuppetEngineConfig) {
        this.config = config;
        this.replicate = new Replicate({ auth: config.replicateApiToken });
        this.maleTts = new FishAudioTtsClient(config.fishApiKey, config.fishMaleVoiceId);
        this.femaleTts = new FishAudioTtsClient(config.fishApiKey, config.fishFemaleVoiceId);
        this.remotionDir = path.resolve(process.cwd(), 'scripts/remotion-puppet');
        this.kieAvatar = config.kieApiKey
            ? new KieAvatarClient(config.kieApiKey, config.kieApiBaseUrl || 'https://api.kie.ai/api/v1')
            : null;
        console.log(`[PuppetEngine] kieApiKey present: ${!!config.kieApiKey}, hybrid mode: ${this.kieAvatar ? 'ENABLED' : 'DISABLED'}`);

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
     * Maps LLM emotion cues to supported expression types
     */
    private mapEmotion(raw: string): string {
        const lower = raw.toLowerCase().trim();
        const map: Record<string, string> = {
            'angry': 'angry', 'furious': 'angry', 'frustrated': 'angry', 'mad': 'angry',
            'cold': 'cold', 'quiet': 'cold', 'distant': 'cold', 'flat': 'cold', 'stern': 'cold',
            'smug': 'smug', 'sarcastic': 'smug', 'mocking': 'smug', 'cocky': 'smug',
            'vulnerable': 'vulnerable', 'sad': 'vulnerable', 'hurt': 'vulnerable', 'soft': 'vulnerable', 'broken': 'vulnerable',
        };
        return map[lower] || 'neutral';
    }

    /**
     * Execute the full puppet dialogue video pipeline.
     */
    public async execute(
        jobId: string,
        caption: string,
        visualPrompt: string,
        turns: PuppetDialogueTurn[],
        hook?: string
    ): Promise<string> {
        console.log(`\n=== 🎭 Initiating Sovereign Puppet Engine for Job: ${jobId} ===\n`);

        const publicDir = path.join(this.remotionDir, 'public');
        if (!fs.existsSync(publicDir)) {
            fs.mkdirSync(publicDir, { recursive: true });
            console.log(`[Puppet] Created Remotion public dir: ${publicDir}`);
        }
        // 1. Generate TTS audio for each dialogue turn
        console.log(`--- Step 1: Generating Fish Audio TTS for ${turns.length} turns ---`);
        const timeline: TimelineTurn[] = [];
        let currentFrame = 15; // Start with a brief pause
        const FPS = 30;
        const GAP_FRAMES = 12; // 0.4s gap between turns

        for (let i = 0; i < turns.length; i++) {
            const turn = turns[i];
            const ttsClient = turn.speaker === 'marco' ? this.maleTts : this.femaleTts;
            
            // Extract emotion cue from line, e.g. "(cold) That's not what I asked."
            const emotionMatch = turn.line.match(/^\s*\((\w+)\)\s*/);
            const emotion = emotionMatch ? this.mapEmotion(emotionMatch[1]) : 'neutral';
            const cleanLine = emotionMatch ? turn.line.replace(emotionMatch[0], '') : turn.line;
            
            console.log(`[Puppet:TTS] Turn ${i + 1}: ${turn.speaker} — "${cleanLine.substring(0, 40)}..."${emotion !== 'neutral' ? ` [${emotion}]` : ''}`);
            const ttsResult = await ttsClient.synthesize(cleanLine);

            // Write audio to the Remotion public dir so staticFile() can access it
            const audioFilename = `puppet_${jobId}_turn${i}.mp3`;
            const audioPath = path.join(publicDir, audioFilename);
            fs.writeFileSync(audioPath, Buffer.from(ttsResult.audioUrl.split(',')[1], 'base64'));

            const durationSec = this.getDuration(audioPath);
            const durationFrames = Math.ceil(durationSec * FPS);

            timeline.push({
                speaker: turn.speaker,
                line: cleanLine,
                audioFile: audioFilename,
                startFrame: currentFrame,
                durationFrames,
                emotion,
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

        // 2b. Hybrid Mode: Generate Kie.ai Avatar lip-sync videos
        let marcoVideoFile: string | null = null;
        let lunaVideoFile: string | null = null;

        if (this.kieAvatar) {
            console.log(`\n--- Step 2b: Generating Kie.ai Avatar lip-sync ---`);

            const cloudinary = require('cloudinary').v2;
            cloudinary.config({
                cloud_name: this.config.cloudinaryCloudName,
                api_key: this.config.cloudinaryApiKey,
                api_secret: this.config.cloudinaryApiSecret,
            });

            // Concat per-speaker audio files
            const marcoAudioFiles = timeline.filter(t => t.speaker === 'marco').map(t => path.join(publicDir, t.audioFile));
            const lunaAudioFiles = timeline.filter(t => t.speaker === 'luna').map(t => path.join(publicDir, t.audioFile));

            const concatAudio = (files: string[], outName: string): string => {
                const outPath = path.join(this.tmpDir, outName);
                if (files.length === 1) {
                    fs.copyFileSync(files[0], outPath);
                } else {
                    const listFile = path.join(this.tmpDir, `${outName}_list.txt`);
                    fs.writeFileSync(listFile, files.map(f => `file '${f}'`).join('\n'));
                    execSync(`ffmpeg -y -f concat -safe 0 -i "${listFile}" -c copy "${outPath}" -loglevel error`);
                }
                return outPath;
            };

            const marcoConcat = concatAudio(marcoAudioFiles, `${jobId}_marco_audio.mp3`);
            const lunaConcat = concatAudio(lunaAudioFiles, `${jobId}_luna_audio.mp3`);

            // Upload audio + portraits to Cloudinary for public URLs
            const marcoPortrait = path.resolve(process.cwd(), 'src/assets/characters/marco_portrait.png');
            const lunaPortrait = path.resolve(process.cwd(), 'src/assets/characters/luna_portrait.png');

            try {
                const [marcoImgRes, lunaImgRes, marcoAudioRes, lunaAudioRes] = await Promise.all([
                    cloudinary.uploader.upload(marcoPortrait, { public_id: `avatar_marco_${jobId}`, resource_type: 'image' }),
                    cloudinary.uploader.upload(lunaPortrait, { public_id: `avatar_luna_${jobId}`, resource_type: 'image' }),
                    cloudinary.uploader.upload(marcoConcat, { public_id: `avatar_marco_audio_${jobId}`, resource_type: 'video' }),
                    cloudinary.uploader.upload(lunaConcat, { public_id: `avatar_luna_audio_${jobId}`, resource_type: 'video' }),
                ]);

                console.log(`[KieAvatar] Assets uploaded. Generating avatars...`);

                // Generate both avatar videos in parallel
                const [marcoResult, lunaResult] = await Promise.all([
                    this.kieAvatar.generateAvatar({ imageUrl: marcoImgRes.secure_url, audioUrl: marcoAudioRes.secure_url }),
                    this.kieAvatar.generateAvatar({ imageUrl: lunaImgRes.secure_url, audioUrl: lunaAudioRes.secure_url }),
                ]);

                // Download avatar videos to Remotion public dir
                marcoVideoFile = `puppet_${jobId}_marco_avatar.mp4`;
                lunaVideoFile = `puppet_${jobId}_luna_avatar.mp4`;

                const [marcoVidRes, lunaVidRes] = await Promise.all([
                    axios.get(marcoResult.videoUrl, { responseType: 'arraybuffer' }),
                    axios.get(lunaResult.videoUrl, { responseType: 'arraybuffer' }),
                ]);

                fs.writeFileSync(path.join(publicDir, marcoVideoFile), marcoVidRes.data);
                fs.writeFileSync(path.join(publicDir, lunaVideoFile), lunaVidRes.data);

                console.log(`[KieAvatar] ✅ Both avatar videos downloaded`);

                // Cleanup temp Cloudinary uploads
                await Promise.all([
                    cloudinary.uploader.destroy(`avatar_marco_${jobId}`, { resource_type: 'image' }).catch(() => {}),
                    cloudinary.uploader.destroy(`avatar_luna_${jobId}`, { resource_type: 'image' }).catch(() => {}),
                    cloudinary.uploader.destroy(`avatar_marco_audio_${jobId}`, { resource_type: 'video' }).catch(() => {}),
                    cloudinary.uploader.destroy(`avatar_luna_audio_${jobId}`, { resource_type: 'video' }).catch(() => {}),
                ]);
            } catch (err: any) {
                console.error(`[KieAvatar] ⚠️ Failed: ${err.message}. Falling back to SVG puppets.`);
                marcoVideoFile = null;
                lunaVideoFile = null;
            }
        }

        // 3. Write timeline.json for the composition
        const timelineFile = path.join(publicDir, `puppet_${jobId}_timeline.json`);
        fs.writeFileSync(timelineFile, JSON.stringify(timeline, null, 2));

        // 4. Render via Remotion CLI
        console.log(`\n--- Step 3: Rendering via Remotion CLI ---`);
        const outputPath = path.join(this.tmpDir, `${jobId}_puppet_raw.mp4`);
        const inputProps: Record<string, any> = {
            timeline,
            backgroundUrl: bgFilename,
            hook: hook || '',
        };

        // If hybrid avatar videos are available, pass them to Remotion
        if (marcoVideoFile && lunaVideoFile) {
            inputProps.marcoVideoFile = marcoVideoFile;
            inputProps.lunaVideoFile = lunaVideoFile;
            console.log(`[Puppet:Remotion] 🎭 Using HYBRID mode (Kie.ai avatars)`);
        } else {
            console.log(`[Puppet:Remotion] Using SVG puppet mode`);
        }

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

        // 7. Webhook dispatch is handled by the orchestrator's notifyCallback()
        console.log(`[Puppet:CDN] ✅ Video ready. Webhook dispatch delegated to orchestrator.`);

        // 8. Cleanup Remotion public dir (remove temp audio/bg files)
        for (const f of fs.readdirSync(publicDir)) {
            if (f.startsWith(`puppet_${jobId}_`)) {
                fs.unlinkSync(path.join(publicDir, f));
            }
        }

        return res.secure_url;
    }
}
