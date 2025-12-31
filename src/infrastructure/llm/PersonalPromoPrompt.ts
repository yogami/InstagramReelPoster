import { WebsiteAnalysis, PromoScriptPlan, PromoSceneContent } from '../../domain/entities/WebsitePromo';

/**
 * Personal Promo Script Prompt
 * 
 * Generates authentic, content-driven promo scripts for personal portfolio sites
 * without relying on rigid business templates.
 */

export function buildPersonalPromoPrompt(
    analysis: WebsiteAnalysis,
    personalName: string,
    language: string
): string {
    const personalInfo = analysis.personalInfo;
    if (!personalInfo) {
        throw new Error('Personal info is required for personal promo script generation');
    }

    const languageInstruction = language === 'de' ? 'in German (informal "du")' : 'in English';

    return `You are an expert at creating compelling personal brand videos for professionals.

**INPUT:**
- Name: ${personalInfo.fullName}
- Title: ${personalInfo.title}
- Bio: ${personalInfo.bio || 'Not provided'}
- Core Skills: ${personalInfo.skills.join(', ')}
- Website Content: ${analysis.heroText}

**TASK:**
Generate a 15-second personal promo reel script ${languageInstruction} that authentically represents ${personalName}'s expertise and value proposition.

**STRUCTURE (3 scenes, 5 seconds each):**

**Scene 1 - HOOK (5s):**
- Open with ${personalName}'s name and ONE specific accomplishment or unique angle
- Must grab attention immediately
- NO generic intros like "Meet..." or "This is..."
- Example: "Sarah Chen. Built AI systems for 2M+ users. Zero downtime."

**Scene 2 - SHOWCASE (5s):**
- Highlight 2-3 specific skills or differentiators
- Use concrete, tangible descriptions
- NO fluff or buzzwords
- Example: "MLOps pipelines. Production-scale inference. Real-time monitoring."

**Scene 3 - CTA (5s):**
- Direct call-to-action
- Make it personal and specific to their work
- Example: "Need scalable AI? Let's build." OR "Portfolio at [name].com"

**STYLE REQUIREMENTS:**
- Direct. Confident. No-BS.
- Short sentences. Punchy delivery.
- Focus on WHAT they do, not WHO they are
- Use technical terms when appropriate (shows expertise)
- Maximum 30 words total across all 3 scenes
- ${languageInstruction === 'in German (informal "du")' ? 'Use informal German ("du"), no corporate jargon' : 'Keep it authentic, not corporate'}

**VISUAL KEYWORDS:**
Scene 1: Professional headshot, clean backdrop, confident energy
Scene 2: Abstract visuals representing their work (code, design, systems, etc.)
Scene 3: Contact info overlay, professional setting

**OUTPUT FORMAT (JSON):**
{
  "coreMessage": "One-sentence summary of their unique value",
  "caption": "Social media friendly caption (30-40 words)",
  "hookType": "direct-intro",
  "scenes": [
    {
      "role": "hook",
      "duration": 5,
      "narration": "EXACTLY what to say (10 words max)",
      "visualKeywords": "Visual style for Scene 1"
    },
    {
      "role": "showcase",
      "duration": 5,
      "narration": "EXACTLY what to say (10 words max)",
      "visualKeywords": "Visual style for Scene 2"
    },
    {
      "role": "cta",
      "duration": 5,
      "narration": "EXACTLY what to say (10 words max)",
      "visualKeywords": "Visual style for Scene 3"
    }
  ]
}

Generate the JSON now. Be ruthless about word count - every word must earn its place.`;
}

/**
 * Validates and parses personal promo script response from LLM.
 */
export function parsePersonalPromoResponse(rawResponse: string): PromoScriptPlan {
    // Extract JSON from markdown code blocks if present
    let jsonText = rawResponse.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonText = codeBlockMatch[1];
    }

    try {
        const parsed = JSON.parse(jsonText);

        // Validate structure
        if (!parsed.scenes || !Array.isArray(parsed.scenes) || parsed.scenes.length !== 3) {
            throw new Error('Personal promo script must have exactly 3 scenes');
        }

        const scenes: PromoSceneContent[] = parsed.scenes.map((scene: any, index: number) => {
            if (!scene.narration || !scene.visualKeywords) {
                throw new Error(`Scene ${index + 1} missing required fields`);
            }

            return {
                role: scene.role || (['hook', 'showcase', 'cta'][index] as 'hook' | 'showcase' | 'cta'),
                duration: scene.duration || 5,
                narration: scene.narration.trim(),
                visualKeywords: scene.visualKeywords.trim()
            };
        });

        return {
            coreMessage: parsed.coreMessage || scenes.map(s => s.narration).join(' '),
            caption: parsed.caption || parsed.coreMessage,
            hookType: parsed.hookType || 'direct-intro',
            scenes,
            logoUrl: undefined,
            logoPosition: 'end',
            // Fields that will be populated by GptLlmClient
            language: 'en', // Will be overridden
            musicStyle: 'tech', // Personal sites default to tech music
        } as PromoScriptPlan;
    } catch (error) {
        throw new Error(`Failed to parse personal promo script: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
