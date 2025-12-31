import {
    NormalizedPage,
    SiteClassification,
    VideoBlueprint,
    SiteType,
    PrimaryIntent,
    StoryBeat,
    BeatStyle
} from '../entities/Intelligence';

export class BlueprintFactory {

    public create(page: NormalizedPage, classification: SiteClassification): VideoBlueprint {
        const beats = this.selectBeats(classification, page);

        return {
            classification,
            beats,
            totalDuration: beats.reduce((sum, b) => sum + b.duration, 0),
            colorPalette: [], // Placeholder for future extraction
            fontPairing: 'Inter' // Placeholder
        };
    }

    private selectBeats(classification: SiteClassification, page: NormalizedPage): StoryBeat[] {
        // DECISION TREE LOGIC

        // 1. SAAS LANDING (Science & Technology Pattern)
        // 1. SAAS LANDING (Science & Technology Pattern)
        // Research: Hero(3s) -> Feature(4s) -> Testimonial(3s) -> CTA(3s)
        if (classification.type === SiteType.SAAS_LANDING) {
            return [
                this.createBeat('hero', 'HOOK', 3, 'zoom_screenshot', 'hero.headline', 'Hook: Stop doing X manually. Visual: Zoom on UI.', page),
                this.createBeat('feature1', 'DEMO', 4, 'split_ui', 'features.0.title', 'Demo: Watch how tool Y does it in seconds.', page),
                this.createBeat('testimonial', 'PROOF', 3, 'quote_animation', 'socialProof.testimonials.0.quote', 'Proof: Rated 5/5 or Customer Quote.', page),
                this.createBeat('cta', 'CTA', 3, 'logo_button', 'cta.text', 'CTA: Try free today.', page)
            ];
        }

        // 2. PORTFOLIO
        if (classification.type === SiteType.PORTFOLIO) {
            const hasHeadshot = !!page.hero.visualUrl;
            return [
                this.createBeat('intro', 'HOOK', 5, hasHeadshot ? 'talking_head' : 'zoom_screenshot', 'hero.headline', 'Introduce the person and their expertise.', page),
                this.createBeat('work', 'PROOF', 5, 'scroll_capture', 'features', 'Showcase 2-3 key projects or skills.', page),
                this.createBeat('cta', 'CTA', 5, 'kinetic_text', 'contact.email', 'Call to action for hiring/contact.', page)
            ];
        }

        // 3. ECOMMERCE (Finance/Business Pattern)
        // Research: Hero(2s) -> ProductGrid(5s) -> PriceHighlight(3s) -> CartCTA(3s)
        if (classification.type === SiteType.ECOMMERCE) {
            return [
                this.createBeat('hero', 'HOOK', 2, 'product_close_up', 'hero.visualUrl', 'Hook: Flash the hero product.', page),
                this.createBeat('grid', 'DEMO', 5, 'split_ui', 'features', 'Showcase: Product grid/variety.', page),
                this.createBeat('price', 'PROOF', 3, 'kinetic_text', 'pricing.pricePoint', 'Highlight: Great price / Deal.', page),
                this.createBeat('cart', 'CTA', 3, 'logo_button', 'cta.text', 'CTA: Add to cart / Shop now.', page)
            ];
        }

        // 4. LOCAL SERVICE
        // Refined for conversion: Show -> Trust -> Call
        if (classification.type === SiteType.LOCAL_SERVICE) {
            return [
                this.createBeat('hook', 'HOOK', 3, 'cinematic_broll', 'hero.headline', 'Show the service being performed.', page),
                this.createBeat('trust', 'PROOF', 4, 'logo_grid', 'socialProof.testimonials', 'Show reviews/trust.', page),
                this.createBeat('cta', 'CTA', 5, 'split_ui', 'contact.phone', 'Call now CTA with phone number.', page)
            ];
        }

        // FALLBACK / GENERIC
        return [
            this.createBeat('hook', 'HOOK', 5, 'zoom_screenshot', 'hero.headline', 'Standard hook.', page),
            this.createBeat('value', 'SOLUTION', 5, 'split_ui', 'hero.subhead', 'Explain value.', page),
            this.createBeat('cta', 'CTA', 5, 'kinetic_text', 'cta.text', 'Standard CTA.', page)
        ];
    }

    private createBeat(
        id: string,
        kind: StoryBeat['kind'],
        duration: number,
        style: BeatStyle,
        source: string,
        instruction: string,
        page?: NormalizedPage // Optional page to resolve content
    ): StoryBeat {
        let contentValue = undefined;

        if (page && source) {
            contentValue = this.resolvePath(page, source);
        }

        return {
            id,
            kind,
            duration,
            style,
            contentSource: source,
            contentValue,
            scriptInstruction: instruction,
            visualInstruction: `Visual style: ${style}`
        };
    }

    private resolvePath(obj: any, path: string): any {
        return path.split('.').reduce((prev, curr) => {
            return prev ? prev[curr] : undefined;
        }, obj);
    }
}
