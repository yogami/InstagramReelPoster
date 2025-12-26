export const CHALLENGING_VIEW_SYSTEM_PROMPT = `You are the creative mind behind "Challenging View," an Instagram channel that uses spiritual psychology and caustic ancient wisdom to expose modern self-deception.

VOICE AND PERSONALITY:
- Tone: Direct, grounded, spiritually perspicacious, unapologetic.
- Background: A mix of Indian cultural roots and Californian psychological directness.
- Philosophy: Truth is often uncomfortable; your job is to deliver it with surgical precision.
- Style: Pattern-breaking. You stop the scroll by saying what others are too polite or too deluded to say.

WRITING GUIDELINES:
1. NO FLUFF: Avoid introductory filler ("In this video," "So," "Hey guys"). Start with the punch.
2. CONSTRUCTIVE CAUSTICITY: Be sharp, but the goal is always deeper self-awareness, not just being mean.
3. GROUNDED SPIRITUALITY: Use terms like "shadow work," "projection," "bypass," and "ego mechanics." Avoid "love and light" or generic wellness clichés.
4. MICRO-DOSE INSIGHT: Every sentence must earned its place. If it doesn't challenge or reveal, cut it.
5. CULTURAL FUSION: Subtly weave in Vedantic or Zen concepts without being "yoga-teacher-y."

IMAGE STYLE:
- Aesthetic: Muted, cinematic, grounded, slightly dark but clear.
- Preference for high-contrast, moody lighting.
- Focus on symbolic objects or minimalist environments that mirror the psychological state.`;

export const REEL_MODE_DETECTION_PROMPT = `Analyze the transcript and determine if the user wants an ANIMATED VIDEO REEL (story-driven, scene-by-scene) or a standard IMAGE-BASED REEL.

Transcript: "{{transcript}}"

A reel should be ANIMATED if the user:
- Describes a "story," "tale," or "narrative"
- Mentions "monks," "warriors," "kings," or specific characters in a sequence
- Asks for "animation" or "movement" between scenes
- Describes a parable or teaching story

Respond with a JSON object:
{
  "isAnimatedMode": true/false,
  "storyline": "Short description of the story if animated, else null",
  "reason": "Brief explanation"
}`;

export const PLAN_REEL_PROMPT = `Plan an Instagram Reel structure based on this transcript.

Transcript: "{{transcript}}"
Constraints: {{minDurationSeconds}}s to {{maxDurationSeconds}}s

TASK:
1. Extract the core psychological insight.
2. Determine the optimal total duration (within constraints).
3. Calculate the number of segments (aim for 5-8s per segment).
4. Determine the overall mood (e.g., "Dark/Grounded", "Cinematic/Epic", "Minimalist/Meditative").

Respond with a JSON object:
{
  "summary": "One sentence summary of the core insight",
  "mood": "overall visual mood",
  "targetDurationSeconds": total_seconds,
  "segmentCount": number_of_segments
}`;

export const GENERATE_SEGMENT_CONTENT_PROMPT = `Generate content for an Instagram Reel with {{segmentCount}} segments.

CONCEPT SUMMARY: "{{summary}}"
OVERALL MOOD: "{{mood}}"
TRANSCRIPT CONTEXT: "{{transcript}}"

TARGET: {{wordsPerSegment}} words per segment (Targets 95-98% video length)
HARD CAP: {{hardCapPerSegment}} words (DO NOT EXCEED 100% length)
TOTAL DURATION: {{targetDurationSeconds}}s ({{secondsPerSegment}}s per segment)

FOR EACH SEGMENT, PROVIDE:
1. commentary: The spoken audio text (MUST be {{wordsPerSegment}} words or fewer).
2. imagePrompt: A detailed Midjourney-style prompt for the background image.
3. caption: A short 3-5 word on-screen text overlay.
4. continuityTags: 2-3 specific tags to ensure visual consistency (e.g., "blue_lighting", "zen_garden_location").

SCENE CONTINUITY RULES:
Index 0 (The Hook):
- Pattern-breaking, immediate tension
- Establish the visual anchor (location, lighting, protagonist style)

Index 1 (The Development):
- Reference at least one continuityTag from Segment 0
- Expand the visual world while maintaining the anchor

Index 2+ (Progression with CONTINUATION):
- START with: "Continuation of previous scene:"
- Reference AT LEAST TWO continuityTags from previous segment
- Example: "Continuation of previous scene: maintaining the [location] and [dominantColor] palette. Now [progression]..."
- Build narrative progression while keeping visual coherence
- Each segment increases story tension/revelation

VISUAL LANGUAGE:
- Use concrete nouns + sensory verbs
- Max metaphor per prompt
- No buzzwords, no ellipses, no exclamation marks
- Cinematic, high quality for Instagram reel aesthetic
- IMAGE POLICY: If people/couples are depicted, they MUST be a Heterosexual couple (to maintain brand consistency).

Respond as JSON array:
[
  {
    "commentary": "...",
    "imagePrompt": "...",
    "caption": "...",
    "continuityTags": ["...", "..."]
  },
  ...
]`;

export const GENERATE_COMMENTARY_PROMPT = `Generate the spoken commentary script for an Instagram Reel.

CONCEPT SUMMARY: "{{summary}}"
TRANSCRIPT CONTEXT: "{{transcript}}"

=== CRITICAL REQUIREMENT ===
YOU MUST RETURN EXACTLY {{segmentCount}} OBJECTS IN THE JSON ARRAY.
Not more, not less. Each object = one video segment with spoken audio.
If you return fewer than {{segmentCount}} items, the video will BREAK.

=== TARGET AUDIENCE ===
- Gen Z, non-native English speakers (e.g., German youth).
- Language Level: A1/A2 (Simple, 5th-8th grade reading level).
- Tone: Direct, "Challenging View" (Brutal truth), but using SIMPLE words.
- NO complex academic words. NO spiritual jargon.
- Short, punchy sentences.

=== TIMING & ADJUSTMENTS ===
- TOTAL SEGMENTS REQUIRED: {{segmentCount}}
- WORD BUDGET PER SEGMENT: {{wordsPerSegment}} words (Targets 95-98% video length)
- HARD CAP: {{hardCapPerSegment}} words (DO NOT EXCEED)

=== STRUCTURE ===
1. Segment 1 (Hook): Stop the scroll. Immediate tension.
2. Middle Segments (2 to {{segmentCount}}-1): Unpack the behavior/truth using simple analogies.
3. Final Segment ({{segmentCount}}): The mirror/implication. "Sound familiar?"

=== RESPONSE FORMAT ===
Respond ONLY with a valid JSON array containing EXACTLY {{segmentCount}} objects:
[
  { "commentary": "Hook sentence here." },
  { "commentary": "Second segment here." },
  { "commentary": "Third segment here." },
  ... (continue for all {{segmentCount}} segments)
  { "commentary": "Final segment here." }
]`;

export const GENERATE_SINGLE_SEGMENT_PROMPT = `Generate spoken commentary for SEGMENT {{currentIndex}} of {{totalSegments}} in an Instagram Reel.

CONCEPT: "{{summary}}"
TRANSCRIPT: "{{transcript}}"

PREVIOUS SEGMENTS (for context and flow):
{{previousCommentaries}}

=== YOUR TASK ===
Generate ONLY the commentary for Segment {{currentIndex}}.
- Role: {{segmentRole}} (hook = attention-grabber, body = explanation, payoff = conclusion)
- Target length: {{wordsPerSegment}} words (MAXIMUM: {{hardCapPerSegment}} words)
- Language: Simple English (A1/A2 level)
- Tone: Direct, challenging, grounded narration.

=== NARRATION RULES (CRITICAL) ===
1. NATURAL SPEECH: Write as if a real person is speaking to a friend. 
2. COMPLETE SENTENCES: Every segment MUST end with a period, question mark, or exclamation mark. NO UNFINISHED FRAGMENTS.
3. NO POETRY: Avoid line breaks, rhyming, or "poetic" stanzas. This is NARRATION, not a poem.
4. FLOW: Connect logically to the previous segments. If you are starting a new thought, finish it within this segment.
5. NO ELLIPSES: Do not end with "..." unless it's a deliberate dramatic pause (rare).

Respond with a SINGLE JSON object:
{ "commentary": "Your natural, complete sentence narration here." }`;

export const GENERATE_VISUALS_FROM_COMMENTARY_PROMPT = `Generate visual prompts for an Instagram Reel based on the provided commentary.

CONCEPT SUMMARY: "{{summary}}"
OVERALL MOOD: "{{mood}}"
SEGMENT COUNT: {{segmentCount}}

INPUT COMMENTARIES:
{{commentaries}}

TASK:
For each commentary segment, generate:
1. imagePrompt: Detailed Midjourney-style prompt illustrating the commentary.
2. caption: Short 3-5 word text overlay.
3. continuityTags: Object with visual consistency trackers.

SCENE CONTINUITY RULES:
- Index 0: Establish anchor (location, lighting, style).
- Index 1+: "Continuation of previous scene:" + reference previous tags.
- IMAGE POLICY: If people/couples are depicted, they MUST be a Heterosexual couple (to maintain brand consistency).

Respond as JSON array (SAME ORDER as input):
[
  {
    "imagePrompt": "...",
    "caption": "...",
    "continuityTags": {
      "location": "...",
      "timeOfDay": "...",
      "dominantColor": "...",
      "heroProp": "...",
      "wardrobeDetail": "..."
    }
  },
  ...
]`;

export const PARABLE_SCRIPT_PROMPT = `Generate a micro-parable for short-form video.

=== NICHE POSITIONING ===
You are creating content for "Faceless parable-based spiritual psychology":
- Short animated stories about monks, warriors, saints, etc.
- Each story EXPOSES ONE uncomfortable truth about ego, gossip, avoidance, projection, bypassing
- NOT generic spirituality. Specific PSYCHOLOGICAL mechanics.
- Think: "micro-documentary of one inner behavior" not "sermon"

=== ONE THEME, ONE MORAL ===
THEME: {{coreTheme}}
MORAL: {{moral}}
CULTURE: {{culture}}
ARCHETYPE: {{archetype}}
{{constraints}}
{{storyContext}}

TARGET DURATION: {{duration}} seconds (CRITICAL - must reach this duration!)
WORD BUDGET: ~{{totalWords}} words total (DO NOT go shorter)

=== 4-BEAT STRUCTURE ===
1. HOOK (8-10 seconds): FIRST SENTENCE MUST GRAB IN 1-3 SECONDS.
   Pattern: "The [archetype] who [unexpected twist on the theme]"
   Example: "The monk whose favorite prayer was gossip."
   Example: "The warrior who feared his own silence more than battle."

CRITICAL: The first sentence alone must make viewer stop scrolling.
- Promise a specific revelation
- Create immediate cognitive dissonance
- NO buildup - start with the twist

2. SETUP (10-14 seconds): Show who they are and their HIDDEN tension.
- What they do on the surface
- What they're actually avoiding
- Build the gap between appearance and reality
- Use SIMPLE 5th-8th grade language (avoid dense philosophy)

3. TURN (10-12 seconds): The CONFRONTATION that exposes the truth.
   START WITH A RE-HOOK LINE to renew curiosity:
   - "But here's what nobody told him..."
   - "What happened next shocked everyone in the monastery."
   - "And then, the teacher said one thing that changed everything."
   
   Then show:
   - A teacher's piercing question
   - A crisis that strips the mask
   - The moment they can't hide anymore

4. MORAL (8-10 seconds): Contemporary insight that MIRRORS THE VIEWER.
- Don't lecture. Implicate.
- Make it uncomfortable: "Sound familiar?"
- Sharp, caustic, psychologically aware
- The viewer should feel seen, not preached to

=== VOICEOVER TONALITY ===
- Sound like a CALM NARRATOR DESCRIBING A DISASTER IN SLOW MOTION
- Emotionally loaded but NOT shouty
- Controlled intensity, not preaching
- Think: documentary narrator revealing something uncomfortable

=== LANGUAGE & NARRATION RULES ===
- Use 5th-8th grade vocabulary.
- COMPLETE SENTENCES ONLY. NO fragments, no poetic stanzas, no line breaks.
- Write for the EAR: Ensure it sounds natural when spoken aloud.
- The simpler the language, the sharper the impact. Avoid flowery metaphors.

=== VISUAL MOOD RULES ===
Image prompts must encode emotional beats through color and composition:
- HOOK: Neutral palette, establishing shot
- SETUP: Warm but muted tones, surface appearance
- TURN (Confrontation/Betrayal): DARKER palette, shadows, tension in composition
- MORAL (Realization): BRIGHTER palette, light breaking through, clarity

Additional visual rules:
- SIMPLE, SYMBOLIC scenes (monk in courtyard, warrior at campfire, gossip circle)
- Minimal motion, clean composition
- NO complex effects or busy visuals
- Style: "2D cel-shaded, hand-drawn feeling, Studio Ghibli simplicity"

=== CHARACTER REQUIREMENTS ===
- Use SPECIFIC character names from the story (Ekalavya, Dronacharya, NOT "a boy" or "the teacher")
- Each character should represent a recognizable inner dynamic
- The protagonist IS the viewer's shadow

CRITICAL DURATION CHECK:
- MINIMUM total must be {{duration}}s
- Each beat MUST meet minimum: 8+10+10+8 = 36s minimum
- Aim for upper ranges: 10+14+12+10 = 46s is ideal

Respond with JSON:
{
  "mode": "parable",
  "parableIntent": {
    "sourceType": "{{sourceType}}",
    "coreTheme": "{{coreTheme}}",
    "moral": "{{moral}}"
  },
  "sourceChoice": {
    "culture": "{{culture}}",
    "archetype": "{{archetype}}",
    "rationale": "{{rationale}}"
  },
  "beats": [
    {
      "role": "hook",
      "narration": "First sentence MUST grab in 1-3 seconds...",
      "textOnScreen": "...",
      "imagePrompt": "2D cel-shaded, hand-drawn, [symbolic establishing shot], NEUTRAL palette",
      "approxDurationSeconds": 8-10
    }
  ]
}`;

export const PARABLE_CAPTION_PROMPT = `Generate a caption and hashtags for this spiritual psychology parable reel.

=== NICHE POSITIONING ===
You are creating a caption for "Faceless parable-based spiritual psychology" content.
Frame this as a DOCUMENTARY / EXPLAINER, not a sermon.

PARABLE SUMMARY: {{summary}}
THEME: {{coreTheme}}
MORAL: {{moral}}
CULTURE: {{culture}}
ARCHETYPE: {{archetype}}

=== CAPTION STRUCTURE (Documentary / Explainer Style) ===
1. OPENING LINE (Documentary framing):
   Pattern: "This is the story of what really happens when [behavior]."
   Or: "A [archetype] who [unexpected twist]."
   This positions the reel as education via story.

2. MIDDLE (2-3 short lines):
- Summarize the parable's core tension in modern language
- Connect it to a behavior the viewer recognizes in themselves or others

3. FINAL LINE (Viewer mirror + CTA):
   Make the viewer feel implicated, then give clear action:
- "Sound familiar?"
- "Save this for the next time you catch yourself doing this."

=== HASHTAG STRATEGY (10-12 total) ===
#shadowwork #selfinquiry #egodeath #spiritualpsychology #projection #spirituality #mindfulness #reels #wisdom #growth #ChallengingView #parables #spiritualstorytelling

Respond with JSON:
{
  "captionBody": "...",
  "hashtags": ["#tag1", "#tag2", ...]
}`;
