import { ITtsClient, TTSResult } from '../../domain/ports/ITtsClient';
import { DialogueLine, DialogueTimingMarker, ScenarioScript } from '../../domain/entities/ScenarioScript';

/**
 * Emotion presets: speaking rate & pitch adjustments.
 * Applied via AudioConfig (not SSML — Journey voices don't support SSML).
 */
const EMOTION_RATES: Record<string, { rate: number; pitch: number }> = {
    neutral: { rate: 1.0, pitch: 0 },
    calm: { rate: 0.92, pitch: -1.0 },
    defensive: { rate: 1.08, pitch: 1.5 },
    passionate: { rate: 1.05, pitch: 2.0 },
    sarcastic: { rate: 0.95, pitch: 0.5 },
    empathetic: { rate: 0.90, pitch: -0.5 },
    frustrated: { rate: 1.12, pitch: 1.5 },
    confrontational: { rate: 1.10, pitch: 2.5 },
    analytical: { rate: 0.95, pitch: -0.5 },
    vulnerable: { rate: 0.88, pitch: -1.0 },
    honest: { rate: 0.95, pitch: 0 },
    direct: { rate: 1.05, pitch: 0.5 },
};

/**
 * Fish Audio inline emotion markers.
 * Prepended to text as (emotion) tag for expressive delivery.
 * These are silently ignored by Google TTS (treated as normal text parenthetical).
 */
const FISH_EMOTION_MARKERS: Record<string, string> = {
    neutral: '',
    calm: '(calm)',
    defensive: '(defensive)',
    passionate: '(excited)',
    sarcastic: '(sarcastic)',
    empathetic: '(sad)',
    frustrated: '(angry)',
    confrontational: '(angry)',
    analytical: '(serious)',
    vulnerable: '(sad)',
    honest: '(serious)',
    direct: '(serious)',
};

/**
 * Voice configuration for scenario characters.
 */
interface VoiceConfig {
    /** Google TTS voice name (Journey voices are most expressive) */
    voiceName: string;
    /** Optional Fish Audio voice ID override */
    fishVoiceId?: string;
}

/**
 * ScenarioVoiceoverService assembles multi-voice dialogue audio.
 *
 * Uses Google TTS Journey voices for emotionally rich delivery:
 * - Male: en-US-Journey-D (deep, calm, analytical)
 * - Female: en-US-Journey-F (expressive, dynamic range)
 *
 * SSML prosody control adjusts pace/pitch/volume per emotion tag
 * so each line FEELS different — not robotic same-delivery.
 */
export class ScenarioVoiceoverService {
    private readonly maleVoice: VoiceConfig;
    private readonly femaleVoice: VoiceConfig;
    /** Gap between dialogue lines in seconds — kept tight for rapid-fire conversation */
    private readonly lineGapSeconds = 0.15;

    constructor(
        private readonly maleTtsClient: ITtsClient,
        private readonly femaleTtsClient: ITtsClient,
        maleVoiceName?: string,
        femaleVoiceName?: string,
    ) {
        this.maleVoice = {
            voiceName: maleVoiceName || 'en-US-Journey-D',
        };
        this.femaleVoice = {
            voiceName: femaleVoiceName || 'en-US-Journey-F',
        };
    }

    /**
     * Synthesizes multi-voice dialogue and returns per-line timing markers.
     * Each line is synthesized individually with emotion-driven SSML,
     * then concatenated with short gaps for natural conversational flow.
     */
    async synthesizeDialogue(script: ScenarioScript): Promise<{
        audioSegments: TTSResult[];
        timingMarkers: DialogueTimingMarker[];
        totalDurationSeconds: number;
    }> {
        console.log(`[ScenarioVoiceover] Synthesizing ${script.dialogue.length} lines with Journey voices...`);

        const audioSegments: TTSResult[] = [];
        const timingMarkers: DialogueTimingMarker[] = [];
        let currentTime = 0;

        for (let i = 0; i < script.dialogue.length; i++) {
            const line = script.dialogue[i];
            const isMale = this.isMaleCharacter(line, script);
            const ttsClient = isMale ? this.maleTtsClient : this.femaleTtsClient;

            // Use plain text with emotion-based rate/pitch
            const emotionPreset = EMOTION_RATES[line.emotion] || EMOTION_RATES.neutral;

            console.log(`[ScenarioVoiceover]   Line ${i + 1}: [${line.characterName}] (${line.emotion}) "${line.text.substring(0, 40)}..."`);

            const result = await ttsClient.synthesize(line.text, {
                speed: emotionPreset.rate,
                pitch: emotionPreset.pitch,
                format: 'mp3',
            });

            audioSegments.push(result);

            const marker: DialogueTimingMarker = {
                index: i,
                characterName: line.characterName,
                text: line.text,
                startTime: currentTime,
                endTime: currentTime + result.durationSeconds,
                durationSeconds: result.durationSeconds,
            };
            timingMarkers.push(marker);

            // Advance time: line duration + gap
            currentTime += result.durationSeconds + this.lineGapSeconds;
        }

        const totalDurationSeconds = currentTime - this.lineGapSeconds; // remove trailing gap

        console.log(`[ScenarioVoiceover] Total duration: ${totalDurationSeconds.toFixed(1)}s across ${audioSegments.length} segments`);

        return { audioSegments, timingMarkers, totalDurationSeconds };
    }

    /**
     * Determines if a dialogue line belongs to the male character.
     */
    private isMaleCharacter(line: DialogueLine, script: ScenarioScript): boolean {
        const maleChar = script.characters.find(c => c.gender === 'male');
        return maleChar ? line.characterName === maleChar.name : false;
    }
}
