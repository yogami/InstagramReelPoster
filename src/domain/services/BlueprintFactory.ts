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
        // 1. SAAS LANDING (Science & Technology Pattern)
        if (classification.type === SiteType.SAAS_LANDING) {
            const hasTestimonial = !!page.socialProof?.testimonials?.length;
            const hasFeatures = !!page.features?.length;

            const beats: StoryBeat[] = [
                this.createBeat('hero', 'HOOK', 3, 'zoom_screenshot', 'hero.headline', 'Hook: Stop doing X manually. Visual: Zoom on UI.', page)
            ];

            if (hasFeatures) {
                beats.push(this.createBeat('feature1', 'DEMO', 4, 'split_ui', 'features.0.title', 'Demo: Watch how tool Y does it in seconds.', page));
            } else {
                beats.push(this.createBeat('value', 'SOLUTION', 4, 'split_ui', 'hero.subhead', 'Explain value proposition.', page));
            }

            if (hasTestimonial) {
                beats.push(this.createBeat('testimonial', 'PROOF', 3, 'quote_animation', 'socialProof.testimonials.0.quote', 'Proof: Show a real customer quote.', page));
            } else if (page.socialProof?.stats?.length) {
                beats.push(this.createBeat('stats', 'PROOF', 3, 'kinetic_text', 'socialProof.stats.0', 'Proof: Show a key metric or result.', page));
            } else {
                // No proof? Reiterate benefit instead of hallucinating
                beats.push(this.createBeat('benefit', 'SOLUTION', 3, 'cinematic_broll', 'hero.subhead', 'Summarize the transformation.', page));
            }

            beats.push(this.createBeat('cta', 'CTA', 3, 'logo_button', 'cta.text', 'CTA: Try it today.', page));
            return beats;
        }

        // 2. PORTFOLIO
        if (classification.type === SiteType.PORTFOLIO) {
            const hasHeadshot = !!page.hero.visualUrl;
            return [
                this.createBeat('intro', 'HOOK', 5, hasHeadshot ? 'talking_head' : 'zoom_screenshot', 'hero.headline', 'Introduce the person and their expertise.', page),
                this.createBeat('work', 'PROOF', 5, 'scroll_capture', 'features', 'Showcase key projects or skills.', page),
                this.createBeat('cta', 'CTA', 5, 'kinetic_text', 'contact.email', 'Call to action for hiring/contact.', page)
            ];
        }

        // 3. ECOMMERCE
        if (classification.type === SiteType.ECOMMERCE) {
            return [
                this.createBeat('hero', 'HOOK', 2, 'product_close_up', 'hero.visualUrl', 'Hook: Flash the hero product.', page),
                this.createBeat('grid', 'DEMO', 5, 'split_ui', 'features', 'Showcase: Product grid/variety.', page),
                this.createBeat('price', 'PROOF', 4, 'kinetic_text', 'pricing.pricePoint', 'Highlight: Value or deal.', page),
                this.createBeat('cart', 'CTA', 3, 'logo_button', 'cta.text', 'CTA: Shop now.', page)
            ];
        }

        // 4. LOCAL SERVICE
        if (classification.type === SiteType.LOCAL_SERVICE) {
            const hasTestimonial = !!page.socialProof?.testimonials?.length;
            return [
                this.createBeat('hook', 'HOOK', 3, 'cinematic_broll', 'hero.headline', 'Show the service being performed.', page),
                hasTestimonial
                    ? this.createBeat('trust', 'PROOF', 4, 'quote_animation', 'socialProof.testimonials.0.quote', 'Show a real customer review.', page)
                    : this.createBeat('value', 'SOLUTION', 4, 'kinetic_text', 'hero.subhead', 'Why customers choose us.', page),
                this.createBeat('cta', 'CTA', 5, 'split_ui', 'contact.phone', 'Call now CTA.', page)
            ];
        }

        // FALLBACK / GENERIC
        return [
            this.createBeat('hook', 'HOOK', 5, 'zoom_screenshot', 'hero.headline', 'Hook: Capture attention.', page),
            this.createBeat('value', 'SOLUTION', 5, 'split_ui', 'hero.subhead', 'Show the solution.', page),
            this.createBeat('cta', 'CTA', 5, 'kinetic_text', 'cta.text', 'Response trigger.', page)
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
