/**
 * Data Collector for Personal Clone Training
 * 
 * Passively collects training data when personalCloneTrainingMode is enabled:
 * - Voice samples (audio + transcript pairs) for TTS training
 * - Text samples (commentary, writing) for LLM personality training
 */

import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../../config';

export interface VoiceSample {
    id: string;
    audioUrl: string;
    transcript: string;
    durationSeconds: number;
    collectedAt: Date;
}

export interface TextSample {
    id: string;
    content: string;
    type: 'commentary' | 'blog' | 'poetry' | 'comment' | 'other';
    collectedAt: Date;
}

export interface TrainingDataStats {
    voiceSamples: number;
    voiceTotalMinutes: number;
    textSamples: number;
    textTotalWords: number;
}

/**
 * Collects and manages training data for Personal Clone.
 */
export class TrainingDataCollector {
    private readonly dataPath: string;
    private readonly voicePath: string;
    private readonly textPath: string;

    constructor(dataPath?: string) {
        const config = getConfig();
        this.dataPath = dataPath || config.personalClone.trainingDataPath;
        this.voicePath = path.join(this.dataPath, 'voice');
        this.textPath = path.join(this.dataPath, 'text');

        this.ensureDirectories();
    }

    private ensureDirectories(): void {
        [this.dataPath, this.voicePath, this.textPath].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Collects a voice sample for TTS training.
     */
    async collectVoiceSample(
        audioUrl: string,
        transcript: string,
        durationSeconds: number
    ): Promise<VoiceSample> {
        const config = getConfig();
        if (!config.featureFlags.personalCloneTrainingMode) {
            throw new Error('Training mode is not enabled');
        }

        const sample: VoiceSample = {
            id: `voice_${Date.now()}`,
            audioUrl,
            transcript,
            durationSeconds,
            collectedAt: new Date()
        };

        const filePath = path.join(this.voicePath, `${sample.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sample, null, 2));

        console.log(`[TrainingData] Collected voice sample: ${sample.id} (${durationSeconds}s)`);
        return sample;
    }

    /**
     * Collects a text sample for LLM personality training.
     */
    async collectTextSample(
        content: string,
        type: TextSample['type'] = 'commentary'
    ): Promise<TextSample> {
        const config = getConfig();
        if (!config.featureFlags.personalCloneTrainingMode) {
            throw new Error('Training mode is not enabled');
        }

        const sample: TextSample = {
            id: `text_${Date.now()}`,
            content,
            type,
            collectedAt: new Date()
        };

        const filePath = path.join(this.textPath, `${sample.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(sample, null, 2));

        console.log(`[TrainingData] Collected text sample: ${sample.id} (${content.split(' ').length} words)`);
        return sample;
    }

    /**
     * Gets statistics about collected training data.
     */
    async getStats(): Promise<TrainingDataStats> {
        const voiceFiles = fs.existsSync(this.voicePath)
            ? fs.readdirSync(this.voicePath).filter(f => f.endsWith('.json'))
            : [];

        const textFiles = fs.existsSync(this.textPath)
            ? fs.readdirSync(this.textPath).filter(f => f.endsWith('.json'))
            : [];

        let voiceTotalSeconds = 0;
        let textTotalWords = 0;

        for (const file of voiceFiles) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(this.voicePath, file), 'utf-8'));
                voiceTotalSeconds += data.durationSeconds || 0;
            } catch { /* ignore corrupt files */ }
        }

        for (const file of textFiles) {
            try {
                const data = JSON.parse(fs.readFileSync(path.join(this.textPath, file), 'utf-8'));
                textTotalWords += (data.content || '').split(/\s+/).length;
            } catch { /* ignore corrupt files */ }
        }

        return {
            voiceSamples: voiceFiles.length,
            voiceTotalMinutes: Math.round(voiceTotalSeconds / 60 * 10) / 10,
            textSamples: textFiles.length,
            textTotalWords
        };
    }

    /**
     * Exports voice samples in format suitable for XTTS training.
     */
    async exportForXTTS(): Promise<string> {
        const exportPath = path.join(this.dataPath, 'xtts_export');
        if (!fs.existsSync(exportPath)) {
            fs.mkdirSync(exportPath, { recursive: true });
        }

        const voiceFiles = fs.readdirSync(this.voicePath).filter(f => f.endsWith('.json'));
        const metadata: { audio_file: string; text: string }[] = [];

        for (const file of voiceFiles) {
            const data: VoiceSample = JSON.parse(
                fs.readFileSync(path.join(this.voicePath, file), 'utf-8')
            );
            metadata.push({
                audio_file: data.audioUrl, // In production, download and save locally
                text: data.transcript
            });
        }

        const metadataPath = path.join(exportPath, 'metadata.json');
        fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

        console.log(`[TrainingData] Exported ${metadata.length} samples to ${exportPath}`);
        return exportPath;
    }

    /**
     * Exports text samples in JSONL format for LLM fine-tuning.
     */
    async exportForLLM(): Promise<string> {
        const exportPath = path.join(this.dataPath, 'llm_export');
        if (!fs.existsSync(exportPath)) {
            fs.mkdirSync(exportPath, { recursive: true });
        }

        const textFiles = fs.readdirSync(this.textPath).filter(f => f.endsWith('.json'));
        const lines: string[] = [];

        for (const file of textFiles) {
            const data: TextSample = JSON.parse(
                fs.readFileSync(path.join(this.textPath, file), 'utf-8')
            );
            // Format for instruction fine-tuning
            lines.push(JSON.stringify({
                instruction: `Write in the style of the user about: ${data.type}`,
                output: data.content
            }));
        }

        const outputPath = path.join(exportPath, 'training_data.jsonl');
        fs.writeFileSync(outputPath, lines.join('\n'));

        console.log(`[TrainingData] Exported ${lines.length} samples to ${outputPath}`);
        return exportPath;
    }
}
