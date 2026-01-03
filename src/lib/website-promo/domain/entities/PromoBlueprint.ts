/**
 * Promo Blueprint Entity
 * 
 * Represents the creative blueprint for a promotional video.
 * Contains story beats that drive the visual narrative.
 */

export type BeatKind = 'HOOK' | 'DEMO' | 'PROOF' | 'SOLUTION' | 'CTA';

export type BeatStyle =
    | 'zoom_screenshot'
    | 'split_ui'
    | 'quote_animation'
    | 'kinetic_text'
    | 'cinematic_broll'
    | 'logo_button'
    | 'talking_head'
    | 'scroll_capture'
    | 'product_close_up';

export interface StoryBeat {
    id: string;
    kind: BeatKind;
    duration: number;
    style: BeatStyle;
    contentSource: string;
    contentValue?: string;
    scriptInstruction: string;
    visualInstruction: string;
}

export interface PromoBlueprint {
    beats: StoryBeat[];
    totalDuration: number;
    colorPalette: string[];
    fontPairing: string;
}
