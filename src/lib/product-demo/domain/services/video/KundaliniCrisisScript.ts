/**
 * Script for the Kundalini Crisis Video
 * Structured perfectly for the Kova Workflow: 5-Act Build Log.
 */
export const KundaliniScript = [
  // Act 1: The Hook (0-3 sec) - No preamble, immediate visual payoff.
  {
    id: "act-1",
    narration: "What happens when enlightenment feels exactly like losing your mind?",
    visualPrompt: "The camera is static, focused on a glowing, intricate web of blue neon nerves floating in absolute darkness. A bright white spark violently travels up the center, causing the entire structure to short-circuit, flashing bright red and orange, bursting into a cloud of digital static.",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },
  
  // Act 2: Conflict & Stakes (3-12 sec)
  {
    id: "act-2",
    narration: "They sell you peace and light. But nobody warns you about the Kundalini crisis. It's not a gentle awakening. It’s a violent system reboot. And I thought I was dying.",
    visualPrompt: "AI generated talking head in a dark room with blackout curtains. Purple and teal RGB lighting. The subject looks exhausted, holding a heavy, ancient-looking medical text in their hands. The room is messy. Cinematic.",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },

  // Act 3: The Build (12-35 sec)
  {
    id: "act-3-1",
    narration: "Symptom 1: Electrical fires. Your nervous system runs hot. Sleep is impossible.",
    visualPrompt: "Extreme macro photography of a sparking wire or static on an old CRT TV, dramatic chiaroscuro lighting, neon orange rim light.",
    sectionHeader: "1",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },
  {
    id: "act-3-2",
    narration: "Symptom 2: The Depersonalization trap. You look in the mirror and nobody is looking back.",
    visualPrompt: "The camera slowly pushes in on a subject's reflection in a dimly lit bathroom mirror. The reflection's face begins to dissolve into a smooth, featureless blur as the camera gets closer.",
    sectionHeader: "2",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },
  {
    id: "act-3-3",
    narration: "Symptom 3: The pressure cooker. Your spine feels like it’s trying to exit your skull.",
    visualPrompt: "Extreme macro photography of an old industrial pressure valve violently releasing steam, dramatic lighting, deep shadows, cinematic 8k.",
    sectionHeader: "3",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },

  // Act 4: Problem & Resolution (35-55 sec)
  {
    id: "act-4-fail",
    narration: "I tried to medicate it. I tried to meditate it away. Nothing worked.",
    visualPrompt: "Return to the talking head shot, but the RGB lights flicker and fail. Pure darkness for a split second.",
    music: "HARD_CUT_SILENCE",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_FRUSTRATED"
  },
  {
    id: "act-4-fix",
    narration: "Until I stopped fighting the current. You don't cure a Kundalini awakening. You ground it. Heavy foods. Bare feet. Hard physical labor.",
    visualPrompt: "Cinematic wide shot of a minimal, clean room with light oak floors. Golden hour sunlight is pouring heavily through large windowpanes, casting long, sharp, geometric shadows on the ground. A heavy, dark river stone sits perfectly still in the center of the light. Calming, grounded aesthetic.",
    music: "BEAT_DROP_85BPM_SYNTH",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_CALM" // Notice the tone shift
  },

  // Act 5: CTA (Teaser) (55-65 sec)
  {
    id: "act-5",
    narration: "But grounding is just phase one. What happens when the energy finally reaches your brain? Hit follow to see what happens next.",
    visualPrompt: "Quick cut back to the dark room, but the RGB lights are now a calming blue. Subject looks directly into camera.",
    music: "MUSIC_FADE_OUT",
    audioStyle: "FISH_AUDIO_SCENARIO_MALE_CALM"
  }
];
