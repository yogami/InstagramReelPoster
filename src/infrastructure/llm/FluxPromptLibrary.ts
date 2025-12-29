/**
 * FLUX.1 Prompt Library
 * Proven templates optimized for Beam.cloud FLUX1.1-dev endpoint.
 * These are high-performing image hooks for Challenging View reels.
 *
 * Motion Illusion Keywords (Perplexity Research):
 * - Lighting: chiaroscuro, volumetric god rays, lens flare, rim lighting, high key contrast
 * - Composition: negative space tension, golden spiral, parallax layering, asymmetrical balance
 *
 * Usage:
 *   import { getRandomFluxTemplate, applyHookToTemplate, FLUX_QUALITY_SUFFIX } from './FluxPromptLibrary';
 *   const template = getRandomFluxTemplate();
 *   const prompt = applyHookToTemplate(template, 'Your ego is lying to you') + FLUX_QUALITY_SUFFIX;
 */

export type ZoomEffect =
    | 'slow_zoom_in'
    | 'slow_zoom_out'
    | 'ken_burns_left'
    | 'ken_burns_right'
    | 'static';

export type CaptionPosition =
    | 'bottom_center'
    | 'top_left'
    | 'center';

export interface FluxPromptTemplate {
    id: string;
    name: string;
    description: string;
    template: string; // {{hook}} placeholder for dynamic text
    zoomEffect: ZoomEffect;
    captionPosition: CaptionPosition;
    mood: string;
}

/**
 * Motion Illusion Lighting Keywords (Perplexity-validated)
 * These amplify zoom/pan depth perception in post-production.
 */
export const MOTION_ILLUSION_LIGHTING = [
    'dramatic chiaroscuro lighting',      // Deep shadows amplify zoom depth
    'volumetric god rays',                // Light shafts move with Ken Burns
    'lens flare edge glow',               // Simulates camera shift
    'subtle depth of field gradient',     // Foreground/background separation
    'motivated rim lighting',             // Outlines pop during pans
] as const;

/**
 * Motion Illusion Composition Tokens (Perplexity-validated)
 * These create "static energy" that enhances motion perception.
 */
export const MOTION_ILLUSION_COMPOSITION = [
    'negative space tension',                    // Draws eye to motion target
    'golden spiral composition',                 // Natural pan guidance
    'layered foreground midground background',   // Parallax illusion
    'asymmetrical balance',                      // Creates "implied motion"
    'high key contrast pop',                     // Elements "jump" during zoom
] as const;

/**
 * Visual Physics Keywords (Perplexity Round 2)
 * These push the motion illusion from 85% to 95% video feel.
 */
export const VISUAL_PHYSICS_KEYWORDS = [
    'atmospheric perspective',        // Distant haze = depth motion
    'bokeh foreground elements',      // Lens rack focus illusion
    'light bloom edges',              // Simulates lens breathing
    'subtle vignette gradient',       // Draws eye through zoom path
    'texture occlusion shadows',      // 3D object layering
] as const;

/**
 * Universal quality suffix for all FLUX prompts (95% video feel).
 * Upgraded with ARRI Alexa LF, atmospheric perspective, bokeh, and vignette.
 * Append this to ALL generated prompts.
 */
export const FLUX_QUALITY_SUFFIX = ', professional studio lighting setup, 8k raw ARRI Alexa LF, shallow depth of field bokeh, atmospheric perspective, light bloom edge glow, shot on Sony A7R IV 85mm f/1.4 GM, subtle vignette gradient, texture occlusion shadows';

/**
 * Curated FLUX.1 hook templates with motion illusion keywords embedded.
 * Updated with Perplexity's chiaroscuro + god rays + parallax recommendations.
 */
export const FLUX_HOOK_TEMPLATES: FluxPromptTemplate[] = [
    {
        id: 'mirror_maze',
        name: 'Mirror Maze Paradox',
        description: 'Infinite reflections representing self-deception and ego loops',
        template: 'infinite mirror maze stretching into darkness, red neon "{{hook}}" text floating in reflections, dramatic chiaroscuro lighting, volumetric god rays piercing atmospheric perspective haze, bokeh foreground glass shards, light bloom on mirror edges, subtle vignette gradient drawing eye inward, texture occlusion shadows on floor, layered reflections creating parallax depth, golden spiral composition, photorealistic cinematic, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_in',
        captionPosition: 'bottom_center',
        mood: 'Dark/Grounded'
    },
    {
        id: 'wise_elder',
        name: 'Wise Elder Closeup',
        description: 'Ancient face with piercing knowing eyes, representing wisdom',
        template: 'ancient wise face half in shadow, intense piercing eyes staring directly at viewer, "{{hook}}" etched in weathered stone behind, motivated rim lighting outlining cheekbones, lens flare catching eye reflections, high key contrast on skin texture, dramatic chiaroscuro, ultra-detailed, 9:16 vertical portrait',
        zoomEffect: 'ken_burns_right',
        captionPosition: 'bottom_center',
        mood: 'Cinematic/Epic'
    },
    {
        id: 'lotus_infinity',
        name: 'Lotus Infinity Loop',
        description: 'Spiritual awakening symbol with cosmic backdrop',
        template: 'glowing white lotus infinity symbol emerging from cosmic mist, volumetric god rays streaming from above, "{{hook}}" in golden light rays, negative space tension around edges, asymmetrical balance drawing eye to center, layered foreground midground background, ultra-detailed photorealistic, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_in',
        captionPosition: 'center',
        mood: 'Minimalist/Meditative'
    },
    {
        id: 'shadow_self',
        name: 'Shadow Self',
        description: 'Person confronting their darker reflection, Jungian shadow work',
        template: 'silhouette of person facing their darker shadow reflection, dramatic chiaroscuro with orange backlight, "{{hook}}" carved into cracked ground between them, volumetric god rays cutting through dust, layered foreground midground background creating parallax depth, psychological tension, 9:16 vertical portrait',
        zoomEffect: 'ken_burns_left',
        captionPosition: 'bottom_center',
        mood: 'Dark/Grounded'
    },
    {
        id: 'breaking_chains',
        name: 'Breaking Chains',
        description: 'Liberation moment, breaking free from limiting beliefs',
        template: 'hands breaking golden chains in slow motion, particles and light flying outward, "{{hook}}" glowing in the dust cloud, motivated rim lighting on hands, volumetric god rays through debris, high key contrast pop on metal, subtle depth of field gradient, ultra-detailed photorealistic, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_in',
        captionPosition: 'bottom_center',
        mood: 'Cinematic/Epic'
    },
    {
        id: 'empty_throne',
        name: 'Empty Throne',
        description: 'Abandoned seat of power, ego detachment',
        template: 'ornate ancient throne sitting empty in a crumbling temple, volumetric god rays through broken ceiling illuminating dust particles, "{{hook}}" carved into the throne back, dramatic chiaroscuro lighting, golden spiral composition, layered pillars creating parallax depth, melancholic atmosphere, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_out',
        captionPosition: 'bottom_center',
        mood: 'Minimalist/Meditative'
    },
    {
        id: 'burning_mask',
        name: 'Burning Mask',
        description: 'False self being consumed, authenticity rising',
        template: 'ornate masquerade mask slowly burning and crumbling, flames revealing a calm face beneath, "{{hook}}" written in smoke above, dramatic chiaroscuro firelight, volumetric smoke with god rays, lens flare from flame edges, high key contrast on embers, ultra-detailed photorealistic, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_in',
        captionPosition: 'center',
        mood: 'Dark/Grounded'
    },
    {
        id: 'crossroads_night',
        name: 'Crossroads at Night',
        description: 'Decision point, choice and consequence',
        template: 'lonely figure standing at misty crossroads under starry night sky, two paths diverging into darkness, "{{hook}}" glowing on weathered signpost, volumetric mist with moon god rays, negative space tension between paths, asymmetrical balance, layered trees creating parallax, moody blue chiaroscuro, 9:16 vertical portrait',
        zoomEffect: 'ken_burns_left',
        captionPosition: 'bottom_center',
        mood: 'Cinematic/Epic'
    },
    {
        id: 'shattered_clock',
        name: 'Shattered Clock',
        description: 'Breaking free from time anxiety, presence',
        template: 'giant ornate clock shattering into thousand pieces frozen mid-air, figure standing calmly in center, "{{hook}}" appearing through fragments, dramatic chiaroscuro, volumetric dust with god rays, layered clock pieces creating parallax depth, high key contrast on glass shards, surreal atmosphere, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_in',
        captionPosition: 'center',
        mood: 'Dark/Grounded'
    },
    {
        id: 'underwater_light',
        name: 'Underwater Light',
        description: 'Rising from depths, awakening from unconscious',
        template: 'figure floating underwater looking up at light streaming from surface, bubbles rising, "{{hook}}" refracted in the water, volumetric god rays penetrating ocean blue, subtle depth of field gradient from dark depths to bright surface, layered water particles creating parallax, lens flare on surface light, ethereal blue-green chiaroscuro, 9:16 vertical portrait',
        zoomEffect: 'slow_zoom_out',
        captionPosition: 'bottom_center',
        mood: 'Minimalist/Meditative'
    }
];

/**
 * Returns a random FLUX prompt template from the library.
 */
export function getRandomFluxTemplate(): FluxPromptTemplate {
    const idx = Math.floor(Math.random() * FLUX_HOOK_TEMPLATES.length);
    return FLUX_HOOK_TEMPLATES[idx];
}

/**
 * Returns a specific FLUX prompt template by ID.
 * Falls back to random if ID not found.
 */
export function getFluxTemplateById(id: string): FluxPromptTemplate {
    const template = FLUX_HOOK_TEMPLATES.find(t => t.id === id);
    return template || getRandomFluxTemplate();
}

/**
 * Applies hook text to a template, replacing {{hook}} placeholder.
 * Automatically appends the quality suffix for optimal results.
 * @param template The FLUX prompt template
 * @param hookText The dynamic text to insert (e.g., "Your ego is lying")
 * @param includeQualitySuffix Whether to append the quality suffix (default: true)
 * @returns Complete FLUX prompt string
 */
export function applyHookToTemplate(
    template: FluxPromptTemplate,
    hookText: string,
    includeQualitySuffix: boolean = true
): string {
    // Truncate hook text if too long (max 60 chars for readability)
    const truncatedHook = hookText.length > 60
        ? hookText.substring(0, 57) + '...'
        : hookText;

    const basePrompt = template.template.replace('{{hook}}', truncatedHook);
    return includeQualitySuffix ? basePrompt + FLUX_QUALITY_SUFFIX : basePrompt;
}

/**
 * Returns templates filtered by mood.
 */
export function getTemplatesByMood(mood: string): FluxPromptTemplate[] {
    const normalizedMood = mood.toLowerCase();
    return FLUX_HOOK_TEMPLATES.filter(t =>
        t.mood.toLowerCase().includes(normalizedMood)
    );
}

/**
 * Returns templates filtered by zoom effect.
 */
export function getTemplatesByZoomEffect(effect: ZoomEffect): FluxPromptTemplate[] {
    return FLUX_HOOK_TEMPLATES.filter(t => t.zoomEffect === effect);
}

/**
 * Returns random motion illusion keywords to enhance any prompt.
 * @param count Number of keywords to return (default: 2)
 */
export function getRandomMotionKeywords(count: number = 2): string[] {
    const all = [...MOTION_ILLUSION_LIGHTING, ...MOTION_ILLUSION_COMPOSITION];
    const shuffled = all.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count) as string[];
}
