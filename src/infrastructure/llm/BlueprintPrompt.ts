import { VideoBlueprint } from '../../domain/entities/Intelligence';
import { PromoScriptPlan } from '../../domain/entities/WebsitePromo';

/**
 * Prompt to generate a script from a strict VideoBlueprint.
 */
export const buildBlueprintPrompt = (blueprint: VideoBlueprint, language: string = 'en'): string => {
    const beatsJson = JSON.stringify(blueprint.beats.map(b => ({
        role: b.kind,
        duration: b.duration,
        style: b.style, // CRITICAL: Pass style to LLM
        instruction: b.scriptInstruction,
        contextSource: b.contentSource,
        contextData: b.contentValue // CRITICAL: Pass actual content to LLM
    })), null, 2);

    return `
You are a master video copywriter. You have been given a strict BLUEPRINT for a high-converting short video.
Your job is to write the Voiceover (NARRAION) and Visual descriptions for each scene defined in the blueprint.

**CONSTRAINTS:**
1. You MUST follow the provided "beats" structure exactly. Do not add or remove scenes.
2. You MUST respect the duration of each scene (approx 2.5 words per second).
3. The tone should match the site type: ${blueprint.classification.type} (${blueprint.classification.intent}).
4. **Visuals:** Respect the provided 'style'.
   - 'zoom_screenshot': Describe the UI element to show.
   - 'quote_animation': Describe a clean abstract background suitable for text overlay.
   - 'cinematic_broll': Describe the action/scene.
5. Output strict JSON.

**BLUEPRINT BEATS:**
${beatsJson}

**LANGUAGE:**
Generate the script in ${language}.

**OUTPUT FORMAT (JSON):**
{
  "coreMessage": "One sentence summary",
  "caption": "Social media caption with hashtags",
  "hookType": "${blueprint.beats[0].kind}",
  "scenes": [
    {
      "role": "hook", 
      "duration": 3,
      "style": "zoom_screenshot", // Echo back the style from blueprint
      "narration": "Script text...",
      "imagePrompt": "Visual description...",
      "subtitle": "Subtitle text..."
    }
    // ... one for each beat
  ]
}`;
};

export const parseBlueprintResponse = (response: string, blueprint: VideoBlueprint): PromoScriptPlan => {
    let json: any;
    try {
        json = JSON.parse(response);
    } catch (e) {
        // Simple heuristic to find JSON if wrapped in markdown
        const match = response.match(/\{[\s\S]*\}/);
        if (match) {
            json = JSON.parse(match[0]);
        } else {
            throw new Error('Failed to parse LLM response as JSON');
        }
    }

    return {
        coreMessage: json.coreMessage,
        caption: json.caption,
        hookType: json.hookType,
        category: 'tech',
        businessName: 'Brand',
        musicStyle: 'upbeat',
        language: 'en',
        compliance: {
            source: 'public-website',
            consent: true,
            scrapedAt: new Date()
        },
        scenes: json.scenes.map((s: any, i: number) => ({
            role: blueprint.beats[i]?.kind.toLowerCase() || 'showcase',
            duration: blueprint.beats[i]?.duration || 5,
            visualStyle: s.style || blueprint.beats[i]?.style || 'cinematic_broll', // Capture style
            narration: s.narration,
            subtitle: s.subtitle || s.narration,
            imagePrompt: s.imagePrompt
        }))
    };
};
