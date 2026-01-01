/**
 * Script Generation Port - Outbound interface for promo script creation.
 * 
 * Abstracts the LLM-based script generation, allowing the slice to work
 * with any AI provider (OpenAI, Anthropic, local models).
 */

import { WebsiteAnalysis, BusinessCategory, PromoScriptPlan } from '../domain/entities/WebsitePromo';

export interface ScriptGenerationOptions {
    /** Analyzed website content */
    websiteAnalysis: WebsiteAnalysis;
    /** Detected or provided business category */
    category: BusinessCategory;
    /** Target language (e.g., 'en', 'de') */
    language: string;
    /** Target duration in seconds */
    targetDurationSeconds: number;
}

export interface IScriptGenerationPort {
    /**
     * Generates a promo script plan from website analysis.
     */
    generateScript(options: ScriptGenerationOptions): Promise<PromoScriptPlan>;

    /**
     * Detects business category from website content.
     */
    detectCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory>;
}
