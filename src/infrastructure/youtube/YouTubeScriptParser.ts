import {
    YouTubeShortInput,
    YouTubeScene,
    YouTubeShortScriptPlan,
    parseTimestamp,
} from '../../domain/entities/YouTubeShort';

/**
 * YouTubeScriptParser
 *
 * Parses structured YouTube Short scripts from Telegram text input.
 * Expected format:
 *
 * Youtube Short Script: [Title]
 * Total Runtime: [N] Seconds | Tone: [Tone]
 *
 * [0:00–0:10] [Scene Title]
 * Visual: [Visual prompt]
 * Narrator: [Narration text]
 */
export class YouTubeScriptParser {
    private static readonly HEADER_REGEX = /^youtube\s+short\s+script:\s*(.+)/i;
    private static readonly RUNTIME_REGEX = /total\s+runtime:\s*(\d+)\s*seconds?(?:\s*\|\s*tone:\s*(.+))?/i;
    private static readonly SCENE_REGEX =
        /\[(\d+:\d+)[–\-](\d+:\d+)\]\s*(.+?)(?:\n|\r\n?)Visual:\s*(.+?)(?:\n|\r\n?)(?:Narrator|Narration):\s*(.+?)(?=\n\[|\n*$)/gis;

    /**
     * Checks if the input text is a YouTube Short script request.
     */
    static isYouTubeRequest(text: string): boolean {
        return this.HEADER_REGEX.test(text.trim());
    }

    /**
     * Parses raw text into YouTubeShortInput.
     * @throws Error if parsing fails or required fields are missing.
     */
    static parse(text: string): YouTubeShortInput {
        const trimmed = text.trim();

        // Extract title
        const headerMatch = this.HEADER_REGEX.exec(trimmed);
        if (!headerMatch) {
            throw new Error('Invalid YouTube script: missing "Youtube Short Script: [Title]" header');
        }
        const title = headerMatch[1].trim();

        // Extract runtime and optional tone
        const runtimeMatch = this.RUNTIME_REGEX.exec(trimmed);
        if (!runtimeMatch) {
            throw new Error('Invalid YouTube script: missing "Total Runtime: N Seconds" line');
        }
        const totalDurationSeconds = parseInt(runtimeMatch[1], 10);
        const tone = runtimeMatch[2]?.trim();

        // Extract scenes
        const scenes: YouTubeScene[] = [];
        let sceneMatch: RegExpExecArray | null;

        // Reset regex lastIndex
        this.SCENE_REGEX.lastIndex = 0;

        while ((sceneMatch = this.SCENE_REGEX.exec(trimmed)) !== null) {
            const startTime = sceneMatch[1];
            const endTime = sceneMatch[2];
            const sceneTitle = sceneMatch[3].trim();
            const visualPrompt = sceneMatch[4].trim();
            const narration = sceneMatch[5].trim();

            const startSeconds = parseTimestamp(startTime);
            const endSeconds = parseTimestamp(endTime);
            const durationSeconds = endSeconds - startSeconds;

            scenes.push({
                startTime,
                endTime,
                title: sceneTitle,
                visualPrompt,
                narration,
                durationSeconds,
            });
        }

        if (scenes.length === 0) {
            throw new Error('Invalid YouTube script: no valid scenes found');
        }

        return {
            title,
            totalDurationSeconds,
            tone,
            scenes,
        };
    }

    /**
     * Converts parsed input to a script plan.
     */
    static toScriptPlan(input: YouTubeShortInput): YouTubeShortScriptPlan {
        return {
            mode: 'youtube-short',
            title: input.title,
            scenes: input.scenes,
            totalDurationSeconds: input.totalDurationSeconds,
            tone: input.tone,
        };
    }
}
