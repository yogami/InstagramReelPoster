/**
 * Blueprint Factory - Domain Service
 * 
 * Creates video blueprints from website analysis using decision tree logic.
 * Pure domain logic with no infrastructure dependencies.
 */

import { WebsiteAnalysis, BusinessCategory } from '../entities/WebsitePromo';
import { PromoBlueprint, StoryBeat, BeatKind, BeatStyle } from '../entities/PromoBlueprint';

export class BlueprintFactory {
    /**
     * Creates a promo blueprint from website analysis.
     */
    create(analysis: WebsiteAnalysis, category: BusinessCategory): PromoBlueprint {
        const beats = this.selectBeats(analysis, category);
        return {
            beats,
            totalDuration: beats.reduce((sum, b) => sum + b.duration, 0),
            colorPalette: [],
            fontPairing: 'Inter'
        };
    }

    private selectBeats(analysis: WebsiteAnalysis, category: BusinessCategory): StoryBeat[] {
        // Category-specific beat selection
        switch (category) {
            case 'restaurant':
            case 'cafe':
                return this.createFoodServiceBeats(analysis);
            case 'gym':
            case 'studio':
                return this.createFitnessBeats(analysis);
            case 'tech':
            case 'agency':
                return this.createTechBeats(analysis);
            case 'service':
                return this.createLocalServiceBeats(analysis);
            default:
                return this.createGenericBeats(analysis);
        }
    }

    private createFoodServiceBeats(analysis: WebsiteAnalysis): StoryBeat[] {
        return [
            this.createBeat('hook', 'HOOK', 3, 'cinematic_broll', analysis.heroText || 'Discover'),
            this.createBeat('showcase', 'DEMO', 5, 'product_close_up', analysis.metaDescription || 'Experience'),
            this.createBeat('proof', 'PROOF', 3, 'quote_animation', 'Customer favorites'),
            this.createBeat('cta', 'CTA', 4, 'logo_button', analysis.cta?.text || 'Visit us')
        ];
    }

    private createFitnessBeats(analysis: WebsiteAnalysis): StoryBeat[] {
        return [
            this.createBeat('hook', 'HOOK', 3, 'cinematic_broll', 'Transform your body'),
            this.createBeat('demo', 'DEMO', 5, 'split_ui', analysis.heroText || 'Train with the best'),
            this.createBeat('proof', 'PROOF', 4, 'kinetic_text', 'Real results'),
            this.createBeat('cta', 'CTA', 3, 'logo_button', analysis.cta?.text || 'Start today')
        ];
    }

    private createTechBeats(analysis: WebsiteAnalysis): StoryBeat[] {
        return [
            this.createBeat('hook', 'HOOK', 3, 'zoom_screenshot', analysis.heroText || 'Stop doing it manually'),
            this.createBeat('demo', 'DEMO', 5, 'split_ui', 'See how it works'),
            this.createBeat('proof', 'PROOF', 4, 'quote_animation', 'Trusted by experts'),
            this.createBeat('cta', 'CTA', 3, 'logo_button', analysis.cta?.text || 'Try it free')
        ];
    }

    private createLocalServiceBeats(analysis: WebsiteAnalysis): StoryBeat[] {
        return [
            this.createBeat('hook', 'HOOK', 3, 'cinematic_broll', analysis.heroText || 'Your local expert'),
            this.createBeat('value', 'SOLUTION', 5, 'kinetic_text', 'Why choose us'),
            this.createBeat('cta', 'CTA', 4, 'split_ui', analysis.phone || 'Call now')
        ];
    }

    private createGenericBeats(analysis: WebsiteAnalysis): StoryBeat[] {
        return [
            this.createBeat('hook', 'HOOK', 4, 'zoom_screenshot', analysis.heroText || 'Discover'),
            this.createBeat('value', 'SOLUTION', 5, 'split_ui', analysis.metaDescription || 'See the difference'),
            this.createBeat('cta', 'CTA', 4, 'kinetic_text', analysis.cta?.text || 'Learn more')
        ];
    }

    private createBeat(
        id: string,
        kind: BeatKind,
        duration: number,
        style: BeatStyle,
        content: string
    ): StoryBeat {
        return {
            id,
            kind,
            duration,
            style,
            contentSource: id,
            contentValue: content,
            scriptInstruction: `${kind}: ${content}`,
            visualInstruction: `Visual style: ${style}`
        };
    }
}
