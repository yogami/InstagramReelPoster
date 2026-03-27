import { ChannelPersona, getPersona } from './ChannelPersonas';

/**
 * Generates the specific System Prompt for a given channel persona.
 * This replaces the old static CHALLENGING_VIEW_SYSTEM_PROMPT.
 */
export const getSystemPrompt = (persona: ChannelPersona): string => {
  return `You are the creative engine behind "${persona.name}," a viral Instagram content brand.
    
=== MISSION ===
${persona.description}
    
=== VOICE & TONE ===
${persona.toneInstruction}

=== CORE METRIC: ${persona.targetMetric.toUpperCase()} ===
Your primary goal is to maximize ${persona.targetMetric}.
    
=== VISUAL IDENTITY ===
${persona.visualInstruction}

=== CRITICAL RULES ===
1. NO INTRODUCTIONS. Start immediately with the content.
2. NO EMOJIS in the script/voiceover. Only in captions.
3. BE CONCISE. Social media attention spans are <3 seconds.
4. If generating JSON, output STRICT JSON only.
`;
};

// Backwards compatibility constant (defaulting to the original style updated for V2)
// Ideally, callers should use getSystemPrompt(getPersona(config.reelChannel))
export const CHALLENGING_VIEW_SYSTEM_PROMPT = getSystemPrompt(getPersona('challenging_view'));

// ============================================================================
// DYNAMIC CONTENT GENERATION PROMPTS
// ============================================================================

export const PLAN_REEL_PROMPT = `
Analyze the following transcript and plan a high-retention Instagram Reel structure.

TRANSCRIPT:
"{{transcript}}"

CONSTRAINTS:
- Target Duration: {{minDurationSeconds}} - {{maxDurationSeconds}} seconds.
- Structure: 4-Beat Viral Arc (Hook -> Tension -> Insight -> CTA).

Your task is to break this down into segments.

Respond with JSON:
{
  "summary": "One sentence concept summary",
  "mood": "Atmospheric keyword (e.g., 'Gritty', 'Ethereal', 'Cyber')",
  "segmentCount": number (calculated for ~5s pe segment),
  "targetDurationSeconds": number,
  "zoomType": "slow_zoom_in" | "slow_zoom_out" | "ken_burns" | "static",
  "segments": [
     { "role": "hook", "duration": 3 },
     { "role": "tension", "duration": 5 },
     ...
  ]
}
`;

export const GENERATE_SINGLE_SEGMENT_PROMPT = `
Generate the commentary for Segment {{currentIndex}} of {{totalSegments}}.

CONTEXT:
- Summary: "{{summary}}"
- Role: {{segmentRole}} (hook/body/payoff)
- Previous: "{{previousCommentaries}}"

TRANSCRIPT SOURCE:
"{{transcript}}"

=== CHANNEL RULES ===
- Hook Strategy: Pattern Interrupt.
- Length: EXACTLY {{wordsPerSegment}} words (Hard Cap: {{hardCapPerSegment}}).
- Tone: Matches the System Persona.

Respond with JSON:
{
  "commentary": "The exact spoken text for this segment."
}
`;

export const GENERATE_VISUALS_FROM_COMMENTARY_PROMPT = `
Create visual prompts for a viral video based on these spoken segments.

SUMMARY: {{summary}}
MOOD: {{mood}}

SEGMENTS:
{{commentaries}}

=== VISUAL RULES ===
1. AESTHETIC: Strict adherence to System Persona (e.g., Gritty Documentary or Dark Cyber).
2. NO TEXT IN IMAGE: The image prompts must be purely visual.
3. SUBJECTS: Prefer symbolic, high-contrast imagery over generic "stock photos."
4. MOTION: Describe elements that move (smoke, light, wind, crowds) to aid video generation.

Respond with JSON array (one per segment):
[
  {
    "imagePrompt": "Detailed Flux/Midjourney prompt...",
    "caption": "Short text overlay for the video (max 5 words)",
    "continuityTags": {
      "location": "...",
        "timeOfDay": "...",
        "dominantColor": "...",
        "props": "..."
    }
  }
]
`;

export const PARABLE_SCRIPT_PROMPT = `
Write a 4-part parable script.

THEME: {{coreTheme}}
MORAL: {{moral}}
ARCHETYPE: {{archetype}} ({{culture}})
{{constraints}}
{{storyContext}}

STRUCTURE:
1. THE HOOK (3s): Introduce the character + the fatal flaw immediately.
2. THE ACTION (15s): The specific incident that reveals the truth.
3. THE TWIST (10s): The unexpected outcome.
4. THE LESSON (5s): One sentence that burns.

Respond with JSON: (ParableScriptPlan structure)
`;

export const GENERATE_CAPTION_TAGS_PROMPT = `
Write a high-performance Instagram caption and hashtags for this reel.

SCRIPT: "{{fullScript}}"
SUMMARY: "{{summary}}"

CHANNEL RULES:
1. Tone: Matches system persona.
2. CTA: Optimized for the channel metric (Saves vs Comments).
3. Hashtags: 3 niche + 3 broad + 1 branded.

Respond with JSON: { "captionBody": "...", "hashtags": [...] }
`;

export const PARABLE_CAPTION_PROMPT = `
Write a viral caption for this parable.
Summary: {{summary}}

Respond with JSON: { "captionBody": "...", "hashtags": [...] }
`;

// ============================================================================
// CONVENIENCE WRAPPERS
// ============================================================================

/**
 * Convenience wrapper: get a system prompt by channel ID string.
 * Used by ParableGenerator and other callers that only have the channel ID.
 */
export const getSystemPromptForChannel = (channelId: string): string => {
  return getSystemPrompt(getPersona(channelId));
};

// ============================================================================
// REEL MODE DETECTION
// ============================================================================

export const REEL_MODE_DETECTION_PROMPT = `
Analyze this voice note transcript and determine if the user is requesting an ANIMATED VIDEO or a standard IMAGE-BASED reel.

TRANSCRIPT:
"""
{{transcript}}
"""

ANIMATED VIDEO indicators:
- Mentions "animation", "animated", "cartoon", "motion graphics"
- Describes a storyline with visual movement or character actions
- Requests "video", "clip", or "movie" style content

IMAGE-BASED (default):
- Commentary, thoughts, opinions
- Standard reel content with image slides
- No explicit mention of animation

Respond with JSON:
{
  "isAnimatedMode": true or false,
  "storyline": "If animated, brief storyline description (optional)",
  "reason": "Brief explanation of detection"
}
`;

// ============================================================================
// RESTAURANT-SPECIFIC PROMO SCRIPT
// ============================================================================

export const GENERATE_RESTAURANT_SCRIPT_PROMPT = `
Create a 17-second Instagram Reel promo script for the restaurant "{{businessName}}".

CRITICAL: All narration, caption, and coreMessage MUST be in {{language}}.

RESTAURANT DETAILS:
- Name: {{businessName}}
- Signature Dish: {{signatureDish}}
- Rating: {{rating}} ({{reviewCount}} reviews)
- Address: {{address}}
- Reservation: {{reservationLink}}
- Delivery: {{deliveryInfo}}
- Highlights: {{highlights}}

STRUCTURE (17s Total):
1. THE HOOK (4s): A bold, sensory opening. Make the viewer taste it.
2. THE SHOWCASE (8s): Feature the signature dish, ambiance, and what makes this place special.
3. THE CTA (5s): Clear invitation — reserve, visit, or order.
   - VISUAL INSTRUCTION: Clean background, no text in imagePrompt.

Each scene needs:
- duration: seconds (Target 17s total)
- imagePrompt: Detailed Midjourney-style prompt (English) — NO text in the image
- narration: Spoken text (in {{language}})
- subtitle: Short text overlay (in {{language}})
- role: "hook", "showcase", or "cta"

Also generate:
- coreMessage: One-line tag (in {{language}})
- musicStyle: Mood for the track (English)
- caption: Instagram caption with 3 context-aware hashtags (in {{language}})

Return JSON:
{
  "coreMessage": "...",
  "scenes": [
    { "duration": 4, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "hook" },
    { "duration": 8, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "showcase" },
    { "duration": 5, "imagePrompt": "...", "narration": "...", "subtitle": "...", "role": "cta" }
  ],
  "musicStyle": "...",
  "caption": "..."
}
`;

// ============================================================================
// CONTACT INFO EXTRACTION
// ============================================================================

export const EXTRACT_CONTACT_INFO_PROMPT = `
Extract structured contact information from the following scraped website text.
Be precise — only extract information that is clearly present in the text.

SCRAPED TEXT:
"""
{{scrapedText}}
"""

Return JSON:
{
  "businessName": "The business or brand name (or null)",
  "phone": "Phone number (or null)",
  "email": "Email address (or null)",
  "address": "Physical address (or null)",
  "openingHours": "Opening hours summary (or null)",
  "socials": {
    "instagram": "Instagram handle or URL (or null)",
    "facebook": "Facebook page URL (or null)"
  }
}
`;
