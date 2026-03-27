import { ILlmClient } from '../../domain/ports/ILlmClient';
import {
    ScenarioScript,
    ScenarioCharacter,
    DialogueLine,
    ScenarioInput,
    EpisodeFormat,
} from '../../domain/entities/ScenarioScript';
import { ScenarioPair, getRandomPair, getPairByDynamic } from '../../domain/services/ScenarioTopicLibrary';
import {
    SeriesCharacter,
    CAST,
    getCharacter,
    getCharactersForPairing,
    getDefaultPairing,
} from '../../domain/services/CharacterRoster';

// ─── PROMPT BUILDERS ─────────────────────────────────────────────────────────

/**
 * Builds the character voice card for injecting into any prompt.
 */
function buildCharacterCard(c: SeriesCharacter): string {
    return `=== ${c.name} ===
Archetype: ${c.archetype}
Emotional signature: ${c.emotionalSignature}
Blind spot: ${c.blindSpot}
How they sound: ${c.voiceStyle}`;
}

/**
 * SOLO prompt — one character reflecting, stream-of-consciousness or voiceover.
 */
const SOLO_PROMPT = `You are writing one episode of a viral Instagram microdrama series about dark psychology, relationship dynamics, and Gen Z emotional life.

THIS EPISODE FORMAT: SOLO — one character, thinking out loud.

${`{{CHARACTER_CARD}}`}

=== THIS EPISODE'S THEME ===
{{theme}}

=== HOW IT SOUNDS ===
- This is a VOICEOVER. The viewer sees the character's face, not action.
- Raw, unfiltered inner monologue. Stream of consciousness. Real thoughts.
- No performance. No polish. This is what they'd think at 2am.
- Short bursts separated by emotional shifts. Not a speech.
- Voice must sound EXACTLY like {{characterName}}'s archetype.

=== STRUCTURE ===
- 8–14 lines total (~{{targetWords}} words for {{targetDuration}}s)
- Arc: raw opening observation → downward spiral → unexpected clarity
- The last line should land like a gut punch or a quiet revelation

=== OUTPUT FORMAT ===
Single JSON object, no markdown:
{
    "title": "3–5 word episode title",
    "topic": "{{theme}}",
    "hook": "The opening line — must grab immediately",
    "dialogue": [
        { "characterName": "{{characterName}}", "text": "...", "emotion": "reflective" },
        { "characterName": "{{characterName}}", "text": "...", "emotion": "vulnerable" }
    ],
    "conclusion": "The final line — quiet devastation or breakthrough",
    "hashtags": ["darkpsychology", "solojourney", "genz", "microdrama", "selfawareness"]
}`;

/**
 * DUO prompt — two characters, one scene, escalating emotional tension.
 */
const DUO_PROMPT = `You are writing one episode of a viral Instagram microdrama series about dark psychology, relationship dynamics, and Gen Z emotional life.

THIS EPISODE FORMAT: DUO — two characters, one continuous scene.

{{CHARACTER_CARDS}}

=== THIS EPISODE'S THEME ===
{{theme}}

=== HOW REAL PEOPLE TALK ===
- Lines are SHORT. 3–12 words max. Nobody gives speeches.
- People interrupt, trail off, react with single words: "Damn." / "Wait." / "Facts."
- Contractions everywhere. Characters DON'T explain psychology — they LIVE it.
- Each character must sound DISTINCT. Their archetype must come through in every line.

=== STRUCTURE ===
- 12–16 lines total (~{{targetWords}} words for {{targetDuration}}s)
- ONE continuous scene. No topic switches. No narrator breaks.
- Arc: hook → escalating tension → gut-punch closing line
- Feels like you walked in mid-scene

=== OUTPUT FORMAT ===
Single JSON object, no markdown:
{
    "title": "3–5 word episode title",
    "topic": "{{theme}}",
    "hook": "The exact opening line — whoever speaks first",
    "dialogue": [
        { "characterName": "{{char1Name}}", "text": "...", "emotion": "frustrated" },
        { "characterName": "{{char2Name}}", "text": "...", "emotion": "calm" }
    ],
    "conclusion": "The gut-punch insight that closes the episode",
    "hashtags": ["darkpsychology", "relationship", "genz", "microdrama", "selfawareness"]
}`;

/**
 * GROUP prompt — three or more characters, social scene or split perspectives.
 */
const GROUP_PROMPT = `You are writing one episode of a viral Instagram microdrama series about dark psychology, relationship dynamics, and Gen Z emotional life.

THIS EPISODE FORMAT: GROUP — multiple characters, one scene.

{{CHARACTER_CARDS}}

=== THIS EPISODE'S THEME ===
{{theme}}

=== HOW REAL PEOPLE TALK ===
- Lines are SHORT. 3–10 words max.
- Group scenes have cross-talk, side comments, people cutting each other off.
- Each character's personality must come through even in small lines.
- Silence and non-responses are as powerful as words.

=== STRUCTURE ===
- 14–20 lines total (~{{targetWords}} words for {{targetDuration}}s)
- ONE continuous scene. Realistic group dynamic.
- Each character must speak at least twice.
- Arc: surface tension → someone says the unsayable → fallout

=== OUTPUT FORMAT ===
Single JSON object, no markdown:
{
    "title": "3–5 word episode title",
    "topic": "{{theme}}",
    "hook": "The line that opens the scene",
    "dialogue": [
        { "characterName": "CharacterName", "text": "...", "emotion": "confrontational" }
    ],
    "conclusion": "The lingering thought after the scene ends",
    "hashtags": ["darkpsychology", "groupdynamics", "genz", "microdrama", "friendship"]
}`;

// ─── MAIN GENERATOR ──────────────────────────────────────────────────────────

/**
 * ScenarioScriptGenerator — produces scripts for the microdrama series.
 *
 * Supports three episode formats:
 *   solo  — one character, inner monologue / voiceover
 *   duo   — two characters, dialogue scene
 *   group — three+ characters, ensemble scene
 *
 * The user drives episode concept spontaneously via `theme` (free-form) or
 * `topic` (topic library lookup).
 */
export class ScenarioScriptGenerator {
    constructor(private readonly llmClient: ILlmClient) { }

    async generate(input: ScenarioInput): Promise<ScenarioScript> {
        const format: EpisodeFormat = input.format || 'duo';
        const targetDuration = input.targetDurationSeconds || 50;
        const wordsPerSecond = 2.4;
        const targetWords = Math.round(targetDuration * wordsPerSecond);

        // Resolve theme — free-form takes priority over topic library
        const theme = this.resolveTheme(input);

        // Resolve cast
        const cast = this.resolveCast(input, format);

        // Build prompt
        const prompt = this.buildPrompt({ format, cast, theme, targetDuration, targetWords });

        console.log(`[ScenarioScript] ${format.toUpperCase()} episode | Cast: ${cast.map(c => c.name).join(', ')} | Theme: "${theme}" | ~${targetWords} words`);

        const rawResponse = await this.llmClient.generateText(prompt);
        return this.parseScript(rawResponse, cast, theme);
    }

    // ─── PRIVATE HELPERS ───────────────────────────────────────────────────────

    private resolveTheme(input: ScenarioInput): string {
        // 1. Free-form theme (user's spontaneous idea — highest priority)
        if (input.theme) return input.theme;

        // 2. Topic library lookup via `topic` key
        if (input.topic) {
            const pair = getPairByDynamic(input.topic);
            return `${pair.dynamic}: ${pair.herLens.premise}`;
        }

        // 3. Random from topic library
        const pair = getRandomPair();
        return `${pair.dynamic}: ${pair.herLens.premise}`;
    }

    private resolveCast(input: ScenarioInput, format: EpisodeFormat): SeriesCharacter[] {
        // Explicit character list from the new API
        if (input.characters && input.characters.length > 0) {
            const resolved = input.characters
                .map(name => getCharacter(name))
                .filter((c): c is SeriesCharacter => c !== undefined);
            if (resolved.length > 0) return resolved;
        }

        // Legacy: characterNames object (duo only)
        if (input.characterNames) {
            const male = getCharacter(input.characterNames.male);
            const female = getCharacter(input.characterNames.female);
            if (male && female) return [male, female];
        }

        // Default by format
        switch (format) {
            case 'solo': {
                // Default solo character: Noa (anxious idealist)
                return [getCharacter('Noa') || CAST[3]];
            }
            case 'group': {
                // Default group: main trio
                return [
                    getCharacter('Ren'),
                    getCharacter('Zara'),
                    getCharacter('Kai'),
                ].filter((c): c is SeriesCharacter => c !== undefined);
            }
            case 'duo':
            default: {
                // Default duo: Ren + Zara
                const { male, female } = getCharactersForPairing();
                return [male, female];
            }
        }
    }

    private buildPrompt(params: {
        format: EpisodeFormat;
        cast: SeriesCharacter[];
        theme: string;
        targetDuration: number;
        targetWords: number;
    }): string {
        const { format, cast, theme, targetDuration, targetWords } = params;

        switch (format) {
            case 'solo': {
                const char = cast[0];
                return SOLO_PROMPT
                    .replace('{{CHARACTER_CARD}}', buildCharacterCard(char))
                    .replace(/{{characterName}}/g, char.name)
                    .replace(/{{theme}}/g, theme)
                    .replace('{{targetWords}}', String(targetWords))
                    .replace('{{targetDuration}}', String(targetDuration));
            }

            case 'group': {
                const cards = cast.map(buildCharacterCard).join('\n\n');
                const nameList = cast.map(c => c.name).join(', ');
                return GROUP_PROMPT
                    .replace('{{CHARACTER_CARDS}}', cards)
                    .replace(/{{theme}}/g, theme)
                    .replace('{{targetWords}}', String(targetWords))
                    .replace('{{targetDuration}}', String(targetDuration));
            }

            case 'duo':
            default: {
                const [char1, char2] = cast;
                const cards = [buildCharacterCard(char1), buildCharacterCard(char2)].join('\n\n');
                return DUO_PROMPT
                    .replace('{{CHARACTER_CARDS}}', cards)
                    .replace(/{{char1Name}}/g, char1.name)
                    .replace(/{{char2Name}}/g, char2.name)
                    .replace(/{{theme}}/g, theme)
                    .replace('{{targetWords}}', String(targetWords))
                    .replace('{{targetDuration}}', String(targetDuration));
            }
        }
    }

    private parseScript(raw: string, cast: SeriesCharacter[], theme: string): ScenarioScript {
        // Strip markdown fences
        let jsonStr = raw.trim();
        const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenceMatch) jsonStr = fenceMatch[1].trim();

        // Strip any non-JSON prefix/suffix
        const start = jsonStr.indexOf('{');
        const end = jsonStr.lastIndexOf('}');
        if (start !== -1 && end !== -1) jsonStr = jsonStr.substring(start, end + 1);

        let parsed: any;
        try {
            parsed = JSON.parse(jsonStr);
        } catch {
            throw new Error(`Failed to parse episode script JSON: ${raw.substring(0, 300)}`);
        }

        const validNames = new Set(cast.map(c => c.name));

        const characters: ScenarioCharacter[] = cast.map(c => ({
            name: c.name,
            gender: c.gender,
            personality: c.archetype,
        }));

        const dialogue: DialogueLine[] = (parsed.dialogue || [])
            .map((line: any) => {
                const rawName = String(line.characterName || '');
                // Snap to nearest valid cast member name (LLM sometimes drifts)
                const characterName = validNames.has(rawName)
                    ? rawName
                    : cast[0].name;
                return {
                    characterName,
                    text: String(line.text || '').trim(),
                    emotion: line.emotion || 'neutral',
                };
            })
            .filter((d: DialogueLine) => d.text.length > 0);

        const wordCount = dialogue.reduce((sum, l) => sum + l.text.split(/\s+/).length, 0);

        return {
            title: parsed.title || theme.split(':')[0].trim(),
            topic: theme,
            characters,
            hook: parsed.hook || dialogue[0]?.text || '',
            dialogue,
            conclusion: parsed.conclusion || '',
            hashtags: parsed.hashtags || ['darkpsychology', 'relationship', 'genz', 'microdrama'],
            wordCount,
        };
    }
}
