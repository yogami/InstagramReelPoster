import { WebsiteAnalysis } from '../entities/WebsitePromo';
import { NormalizedPage } from '../entities/Intelligence';

/**
 * Service to normalize raw scraper data into semantic page structure.
 * This ensures the Blueprint Engine works with clean, consistent data.
 */
export class PageNormalizer {

    public normalize(analysis: WebsiteAnalysis): NormalizedPage {
        const sourceUrl = analysis.sourceUrl || '';

        return {
            hero: this.extractHero(analysis),
            features: this.extractFeatures(analysis),
            socialProof: this.extractSocialProof(analysis),
            pricing: this.extractPricing(analysis),
            cta: this.extractCta(analysis),
            contact: this.extractContact(analysis),
            meta: {
                title: analysis.heroText || '',
                description: analysis.metaDescription || '',
                originalUrl: sourceUrl
            },
            rawAnalysis: analysis
        };
    }

    private extractHero(analysis: WebsiteAnalysis) {
        // Fallback for subhead: meta description or first paragraph
        let subhead = analysis.metaDescription || '';
        if (!subhead && analysis.aboutContent) {
            subhead = analysis.aboutContent.substring(0, 150) + '...';
        }

        return {
            headline: analysis.heroText || 'Welcome',
            subhead: subhead,
            visualUrl: this.findBestHeroImage(analysis)
        };
    }

    private extractFeatures(analysis: WebsiteAnalysis) {
        // If we extracted explicit key points/features (not yet in WebsiteAnalysis standard fields, 
        // relying on keywords as proxy for now)
        return analysis.keywords.slice(0, 3).map(k => ({
            title: k,
            description: `Key feature: ${k}`
        }));
    }

    private extractSocialProof(analysis: WebsiteAnalysis) {
        // Limitation: WebsiteAnalysis only stores quotes, not authors
        const testimonials = analysis.testimonialsContent?.quotes?.map(quote => ({
            quote: quote,
            author: 'Customer' // Generic fallback since we don't have author extraction yet
        })) || [];

        return {
            testimonials,
            logos: [], // Logo detection would go here
            stats: []  // Stat detection would go here
        };
    }

    private extractPricing(analysis: WebsiteAnalysis) {
        const text = analysis.pricingContent?.rawText || '';
        const lowerText = text.toLowerCase();

        const hasFreeTier = lowerText.includes('free') || lowerText.includes('€0') || lowerText.includes('$0');

        // Simple regex to find first price format like $29, €49, 29€
        const priceMatch = text.match(/[$€]\d+|\d+[$€]/);

        return {
            hasFreeTier,
            pricePoint: priceMatch ? priceMatch[0] : undefined,
            model: (lowerText.includes('month') ? 'SUBSCRIPTION' : undefined) as 'SUBSCRIPTION' | 'ONE_TIME' | 'QUOTE' | undefined
        };
    }

    private extractCta(analysis: WebsiteAnalysis) {
        // Use Scraper/Analysis CTA if detected
        if (analysis.cta?.text) {
            return {
                text: analysis.cta.text,
                link: analysis.cta.link || analysis.sourceUrl || '#',
                type: analysis.cta.type || 'contact'
            };
        }

        // Fallback
        return {
            text: 'Learn More',
            link: analysis.sourceUrl || '#',
            type: 'contact' as 'contact' | 'signup' | 'buy' | 'demo'
        };
    }

    private extractContact(analysis: WebsiteAnalysis) {
        return {
            email: analysis.email,
            phone: analysis.phone,
            address: analysis.address,
            openingHours: analysis.openingHours
        };
    }

    private findBestHeroImage(analysis: WebsiteAnalysis): string | undefined {
        const hero = analysis.scrapedMedia?.find(m => m.isHero);
        if (hero) return hero.url;

        // Fallback to first large image
        return analysis.scrapedMedia?.find(m => m.width > 800)?.url;
    }
}
