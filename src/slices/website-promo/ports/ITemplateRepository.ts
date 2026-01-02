/**
 * Template Repository Port Interface
 * 
 * Provides access to pre-built promo templates for different business categories.
 */

import { BusinessCategory } from '../domain/entities/WebsitePromo';

export interface PromoTemplate {
    id: string;
    name: string;
    description: string;
    category: BusinessCategory;
    sceneCount: number;
    musicStyle: string;
    visualTheme: string;
    /** Scene structure hints for the LLM */
    sceneHints: {
        role: 'hook' | 'showcase' | 'cta';
        durationSeconds: number;
        visualHint: string;
    }[];
    /** Default motion style for this template */
    defaultMotionStyle: 'ken_burns' | 'zoom_in' | 'zoom_out' | 'static';
    /** Default subtitle style */
    defaultSubtitleStyle: 'minimal' | 'bold' | 'karaoke';
}

export interface ITemplateRepository {
    /**
     * Get a specific template by ID.
     */
    getTemplate(id: string): Promise<PromoTemplate | null>;

    /**
     * List all available templates, optionally filtered by category.
     */
    listTemplates(category?: BusinessCategory): Promise<PromoTemplate[]>;

    /**
     * Get the recommended template for a business category.
     */
    getRecommendedTemplate(category: BusinessCategory): Promise<PromoTemplate | null>;
}
