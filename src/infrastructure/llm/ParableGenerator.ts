import {
    ContentModeDetectionResult,
} from '../../domain/ports/ILlmClient';
import {
    ParableIntent,
    ParableSourceChoice,
    ParableScriptPlan,
    isParableScriptPlan,
    ContentMode,
} from '../../domain/entities/Parable';
import { CaptionAndTags } from '../../domain/entities/Growth';
import { getConfig } from '../../config';
import { GptService } from './GptService';
import {
    PARABLE_SCRIPT_PROMPT,
    PARABLE_CAPTION_PROMPT,
} from './Prompts';

/**
 * Handles generation of parable-style content for reels.
 */
export class ParableGenerator {
    private readonly openAI: GptService;

    constructor(openAI: GptService) {
        this.openAI = openAI;
    }

    /**
     * Detects whether the transcript is story-oriented (parable) or direct commentary.
     */
    async detectContentMode(transcript: string): Promise<ContentModeDetectionResult> {
        if (!transcript || transcript.trim().length === 0) {
            return {
                contentMode: 'direct-message',
                reason: 'Empty transcript defaults to direct-message mode'
            };
        }

        const prompt = `Analyze this voice note transcript and determine if it's asking for a PARABLE/STORY or DIRECT COMMENTARY.

Transcript:
"""
${transcript}
"""

PARABLE KEYWORDS (return "parable" if any are present):
- "story", "tale", "parable", "once upon"
- "monk", "sage", "saint", "warrior", "king", "farmer"
- "ancient", "old tale", "legend", "fable"
- References to Zen, Sufi, Buddhist, Hindu, or folklore stories
- Describing characters, scenes, or narratives

DIRECT-MESSAGE (default - return this if no story indicators):
- Commentary, rant, thoughts, opinions
- Discussing concepts without narrative framing
- Educational or explanatory content

Respond with JSON:
{
  "contentMode": "parable" or "direct-message",
  "reason": "brief explanation"
}`;

        try {
            const systemPrompt = 'You are an intent detection assistant. Analyze user input and return structured JSON responses. Be precise and factual.';
            const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true, temperature: 0.3 });
            const parsed = this.openAI.parseJSON<{ contentMode?: string; reason?: string }>(response);

            const contentMode: ContentMode = parsed.contentMode === 'parable' ? 'parable' : 'direct-message';
            return {
                contentMode,
                reason: parsed.reason || 'No reason provided'
            };
        } catch (error) {
            console.warn('[ParableGenerator] Content mode detection failed, defaulting to direct-message:', error);
            return {
                contentMode: 'direct-message',
                reason: 'Detection failed, defaulting to direct-message'
            };
        }
    }

    /**
     * Extracts parable intent from transcript.
     */
    async extractParableIntent(transcript: string): Promise<ParableIntent> {
        const prompt = `Extract the parable intent from this transcript.

Transcript:
"""
${transcript}
"""

Determine:
1. sourceType: 
   - "provided-story" if user describes a specific tale, character, or historical figure (e.g., Ekalavya, Buddha, Chanakya)
   - "theme-only" if user discusses an abstract theme/idea without specifying a story

2. coreTheme: The psychological/spiritual theme (e.g., "gossip", "envy", "spiritual bypassing", "ego", "attachment", "atomic habits", "discipline")

3. moral: 1-2 sentence insight the user wants to convey

4. culturalPreference (optional): If user mentions or implies a culture ("indian", "chinese", "japanese", "sufi", "western-folklore", "generic-eastern")

5. constraints (optional): Any specific requirements (e.g., "must be about a monk", "warrior archetype")

6. providedStoryContext (CRITICAL for provided-story): If sourceType is "provided-story", extract ALL specific details:
   - Character names mentioned (e.g., "Ekalavya", "Dronacharya", "Arjuna")
   - Historical/mythological context
   - Specific story elements the user described
   - Key plot points or actions mentioned
   This preserves the user's exact story request.

Respond with JSON:
{
  "sourceType": "provided-story" or "theme-only",
  "coreTheme": "...",
  "moral": "...",
  "culturalPreference": "optional...",
  "constraints": ["optional array..."],
  "providedStoryContext": "For provided-story only: Full context with character names and story details"
}`;

        const systemPrompt = 'You are an intent extraction assistant. Extract structured data from the transcript.';
        const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const parsed = this.openAI.parseJSON<ParableIntent>(response);

        return {
            sourceType: parsed.sourceType === 'provided-story' ? 'provided-story' : 'theme-only',
            coreTheme: parsed.coreTheme || 'spiritual insight',
            moral: parsed.moral || 'The truth is always uncomfortable.',
            culturalPreference: parsed.culturalPreference,
            constraints: parsed.constraints,
            providedStoryContext: parsed.providedStoryContext
        };
    }

    /**
     * Chooses story-world for theme-only parables.
     */
    async chooseParableSource(intent: ParableIntent): Promise<ParableSourceChoice> {
        const prompt = `Choose the best story-world for this parable intent.

Theme: ${intent.coreTheme}
Moral: ${intent.moral}
${intent.culturalPreference ? `User preference: ${intent.culturalPreference}` : ''}
${intent.constraints?.length ? `Constraints: ${intent.constraints.join(', ')}` : ''}

CULTURES (pick one that best expresses the theme):
- indian: Hindu, Vedantic, yoga traditions
- chinese: Chan/Zen Buddhism, Taoist tales
- japanese: Zen, samurai, bushido
- sufi: Islamic mysticism, Rumi-style
- western-folklore: Christian monastics, medieval saints, mythic kings
- generic-eastern: Universal "ancient master" archetype

ARCHETYPES (pick one):
- monk: Renunciant, ascetic, meditative
- sage: Wise elder, teacher
- saint: Devoted, miraculous
- warrior: Fighter, samurai, general
- king: Ruler, leader
- farmer: Simple, grounded
- villager: Community member
- student: Learner, seeker

Respond with JSON:
{
  "culture": "...",
  "archetype": "...",
  "rationale": "Why this combination fits the theme"
}`;

        const systemPrompt = 'You are a creative story curator. Choose the best cultural setting and archetype for a story.';
        const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const parsed = this.openAI.parseJSON<ParableSourceChoice>(response);

        return {
            culture: parsed.culture || 'generic-eastern',
            archetype: parsed.archetype || 'sage',
            rationale: parsed.rationale || 'Default selection'
        };
    }

    /**
     * Generates complete parable script with 4-beat structure.
     */
    async generateParableScript(
        intent: ParableIntent,
        sourceChoice: ParableSourceChoice,
        targetDurationSeconds: number
    ): Promise<ParableScriptPlan> {
        const config = getConfig();
        const effectiveDuration = Math.max(targetDurationSeconds, 30);
        const totalWords = Math.floor(effectiveDuration * config.speakingRateWps * 0.97);

        const prompt = this.buildParableScriptPrompt(intent, sourceChoice, effectiveDuration, totalWords);
        const systemPrompt = 'You are a master storyteller for short-form video. Create a 4-beat parable script.';

        const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const parsed = this.openAI.parseJSON<ParableScriptPlan>(response);

        if (!isParableScriptPlan(parsed)) {
            throw new Error('Invalid parable script structure from LLM');
        }

        return parsed;
    }

    private buildParableScriptPrompt(
        intent: ParableIntent,
        sourceChoice: ParableSourceChoice,
        duration: number,
        totalWords: number
    ): string {
        const constraintsStr = intent.constraints?.length
            ? `CONSTRAINTS: ${intent.constraints.join(', ')}`
            : '';

        const storyContextSection = intent.providedStoryContext
            ? `\nUSER'S SPECIFIC STORY (CRITICAL - USE THESE EXACT CHARACTERS AND DETAILS):\n"""\n${intent.providedStoryContext}\n"""\nYOU MUST use the specific character names and story elements from above. Do NOT invent generic characters.\n`
            : '';

        return PARABLE_SCRIPT_PROMPT
            .replace(/{{coreTheme}}/g, intent.coreTheme)
            .replace(/{{moral}}/g, intent.moral)
            .replace(/{{culture}}/g, sourceChoice.culture)
            .replace(/{{archetype}}/g, sourceChoice.archetype)
            .replace('{{constraints}}', constraintsStr)
            .replace('{{storyContext}}', storyContextSection)
            .replace(/{{duration}}/g, duration.toString())
            .replace('{{totalWords}}', totalWords.toString())
            .replace('{{sourceType}}', intent.sourceType || 'theme-only')
            .replace('{{rationale}}', sourceChoice.rationale || 'Default selection');
    }

    /**
     * Generates hooks specifically for parable content.
     */
    async generateParableHooks(
        parableScript: ParableScriptPlan,
        trendContext?: string
    ): Promise<string[]> {
        const hookBeat = parableScript.beats.find(b => b.role === 'hook');

        const prompt = `Generate 5 viral hooks for this spiritual psychology parable.

=== NICHE POSITIONING ===
You are creating hooks for "Faceless parable-based spiritual psychology" content.
These hooks must PROMISE a surprising angle on a familiar, uncomfortable topic.
Think: documentary reveal, not sermon announcement.

PARABLE CONTEXT:
- Theme: ${parableScript.parableIntent.coreTheme}
- Moral: ${parableScript.parableIntent.moral}
- Culture: ${parableScript.sourceChoice.culture}
- Archetype: ${parableScript.sourceChoice.archetype}
- Current hook: ${hookBeat?.narration || 'Not available'}
${trendContext ? `- Trend context: ${trendContext}` : ''}

=== HOOK FORMULA (Documentary / Explainer Style) ===
Pattern 1: "The [archetype] who [unexpected twist on theme]"
- "The monk whose favorite prayer was gossip."
- "The warrior who feared his own silence more than battle."

Pattern 2: "What actually happens when [familiar behavior]"
- "What actually happens when spiritual people gossip."
- "The psychology behind 'I'm just concerned.'"

Pattern 3: Implicating statement that mirrors viewer
- "His prayers were whispers about others."
- "He could sit in stillness for hours. But his words never rested."

=== REQUIREMENTS ===
- Reference character + tension
- Pattern-breaking, attention-grabbing
- NO questions (statements work better for parables)
- Promise a REVEAL, not a lesson

Respond with JSON:
{
  "hooks": ["Hook 1...", "Hook 2...", "Hook 3...", "Hook 4...", "Hook 5..."]
}`;

        const systemPrompt = 'You are a viral hook expert for social media.';
        const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ hooks: string[] }>(response);

        return parsed.hooks || [hookBeat?.narration || 'A story of spiritual awakening.'];
    }

    /**
     * Generates captions optimized for parable content.
     */
    async generateParableCaptionAndTags(
        parableScript: ParableScriptPlan,
        summary: string
    ): Promise<CaptionAndTags> {
        const prompt = this.buildParableCaptionPrompt(parableScript, summary);
        const systemPrompt = 'You are an Instagram caption expert.';
        const response = await this.openAI.chatCompletion(prompt, systemPrompt, { jsonMode: true });
        const parsed = this.openAI.parseJSON<{ captionBody: string; hashtags: string[] | string }>(response);

        return this.processParableCaptionResponse(parsed, parableScript);
    }

    private buildParableCaptionPrompt(script: ParableScriptPlan, summary: string): string {
        return PARABLE_CAPTION_PROMPT
            .replace('{{summary}}', summary)
            .replace('{{coreTheme}}', script.parableIntent.coreTheme)
            .replace('{{moral}}', script.parableIntent.moral)
            .replace('{{culture}}', script.sourceChoice.culture)
            .replace('{{archetype}}', script.sourceChoice.archetype);
    }

    private processParableCaptionResponse(
        parsed: Record<string, unknown>,
        script: ParableScriptPlan
    ): CaptionAndTags {
        let hashtags: string[] = [];
        if (Array.isArray(parsed.hashtags)) {
            hashtags = parsed.hashtags;
        } else if (typeof parsed.hashtags === 'string') {
            hashtags = parsed.hashtags.split(/[\s,]+/).filter((t: string) => t.length > 0);
        }

        hashtags = hashtags
            .map((t: string) => t.startsWith('#') ? t : `#${t}`)
            .filter((t: string) => t !== '#');

        if (hashtags.length < 8) {
            const defaults = ['#ChallengingView', '#parables', '#spirituality', '#reels', '#shadowwork', '#selfinquiry', '#spiritualstorytelling', '#mindfulness'];
            hashtags = Array.from(new Set([...hashtags, ...defaults])).slice(0, 12);
        }

        const captionBody = (parsed.captionBody as string) || `A ${script.sourceChoice.archetype}'s lesson in ${script.parableIntent.coreTheme}.\n\nSave this.`;

        return {
            captionBody,
            hashtags
        };
    }
}
