/**
 * In-Memory Template Repository
 * 
 * Pre-defined templates for different business categories.
 * Optimized for Berlin-style promos with high-end aesthetics.
 */

import { ITemplateRepository, PromoTemplate } from '../ports/ITemplateRepository';
import { BusinessCategory } from '../domain/entities/WebsitePromo';

const TEMPLATES: PromoTemplate[] = [
    // Restaurant Templates
    {
        id: 'restaurant-elegant',
        name: 'Elegant Dining',
        description: 'Sophisticated, upscale restaurant promo with focus on atmosphere',
        category: 'restaurant',
        sceneCount: 3,
        musicStyle: 'jazz-lounge',
        visualTheme: 'warm-moody-lighting',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Close-up of signature dish with steam rising' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Chef at work, interior ambiance, happy diners' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Empty table with reservation card, warm lighting' }
        ],
        defaultMotionStyle: 'ken_burns',
        defaultSubtitleStyle: 'bold'
    },
    {
        id: 'restaurant-casual',
        name: 'Casual Eats',
        description: 'Fun, approachable vibe for casual dining',
        category: 'restaurant',
        sceneCount: 3,
        musicStyle: 'upbeat-acoustic',
        visualTheme: 'bright-natural-light',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Friends sharing food, laughing' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Menu highlights, kitchen energy' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Order screen or delivery box' }
        ],
        defaultMotionStyle: 'zoom_in',
        defaultSubtitleStyle: 'bold'
    },

    // Cafe Templates
    {
        id: 'cafe-cozy',
        name: 'Cozy Cafe',
        description: 'Warm, inviting neighborhood cafe atmosphere',
        category: 'cafe',
        sceneCount: 3,
        musicStyle: 'lo-fi-chill',
        visualTheme: 'warm-wooden-tones',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Latte art being poured in slow motion' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Cozy interior, pastry display, barista at work' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Empty seat by window with coffee cup' }
        ],
        defaultMotionStyle: 'ken_burns',
        defaultSubtitleStyle: 'minimal'
    },

    // Gym Templates
    {
        id: 'gym-power',
        name: 'Power Fitness',
        description: 'High-energy, motivational gym promo',
        category: 'gym',
        sceneCount: 3,
        musicStyle: 'electronic-motivational',
        visualTheme: 'high-contrast-dramatic',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Athlete mid-workout, intense focus' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Equipment, group classes, transformation shots' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Open gym floor with "Your journey starts here" vibe' }
        ],
        defaultMotionStyle: 'zoom_in',
        defaultSubtitleStyle: 'bold'
    },

    // Tech Templates
    {
        id: 'tech-innovative',
        name: 'Tech Innovator',
        description: 'Modern, sleek tech company or SaaS promo',
        category: 'tech',
        sceneCount: 3,
        musicStyle: 'ambient-electronic',
        visualTheme: 'clean-minimal-blue',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Abstract data visualization or product UI' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Team collaboration, product features, user success' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Clean CTA screen with demo invitation' }
        ],
        defaultMotionStyle: 'static',
        defaultSubtitleStyle: 'minimal'
    },

    // Agency Templates
    {
        id: 'agency-creative',
        name: 'Creative Agency',
        description: 'Bold, portfolio-focused agency showcase',
        category: 'agency',
        sceneCount: 3,
        musicStyle: 'indie-creative',
        visualTheme: 'bold-colorful-modern',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Portfolio piece or award winning work' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Team brainstorming, client logos, process shots' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Contact screen with creative flair' }
        ],
        defaultMotionStyle: 'ken_burns',
        defaultSubtitleStyle: 'bold'
    },

    // Service Templates
    {
        id: 'service-professional',
        name: 'Professional Services',
        description: 'Trust-building promo for professional services',
        category: 'service',
        sceneCount: 3,
        musicStyle: 'corporate-inspiring',
        visualTheme: 'clean-professional-neutral',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Problem statement or client pain point visualization' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Expert at work, testimonials, credentials' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Consultation booking or contact information' }
        ],
        defaultMotionStyle: 'zoom_out',
        defaultSubtitleStyle: 'minimal'
    },

    // Studio Templates
    {
        id: 'studio-artistic',
        name: 'Creative Studio',
        description: 'Artistic, portfolio-driven studio promo',
        category: 'studio',
        sceneCount: 3,
        musicStyle: 'ambient-atmospheric',
        visualTheme: 'moody-artistic-contrast',
        sceneHints: [
            { role: 'hook', durationSeconds: 4, visualHint: 'Stunning portfolio piece or work in progress' },
            { role: 'showcase', durationSeconds: 8, visualHint: 'Artist at work, workspace, finished pieces' },
            { role: 'cta', durationSeconds: 5, visualHint: 'Booking calendar or commission inquiry' }
        ],
        defaultMotionStyle: 'ken_burns',
        defaultSubtitleStyle: 'minimal'
    }
];

export class InMemoryTemplateRepository implements ITemplateRepository {
    private readonly templates: PromoTemplate[];

    constructor(additionalTemplates?: PromoTemplate[]) {
        this.templates = [...TEMPLATES, ...(additionalTemplates || [])];
    }

    async getTemplate(id: string): Promise<PromoTemplate | null> {
        return this.templates.find(t => t.id === id) || null;
    }

    async listTemplates(category?: BusinessCategory): Promise<PromoTemplate[]> {
        if (!category) {
            return [...this.templates];
        }
        return this.templates.filter(t => t.category === category);
    }

    async getRecommendedTemplate(category: BusinessCategory): Promise<PromoTemplate | null> {
        // Return the first template for the category (they're ordered by preference)
        const categoryTemplates = await this.listTemplates(category);
        return categoryTemplates[0] || null;
    }
}
