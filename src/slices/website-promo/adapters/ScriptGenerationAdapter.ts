/**
 * Script Generation Adapter
 * 
 * Bridges the slice's IScriptGenerationPort to the existing LLM infrastructure.
 */

import { IScriptGenerationPort, ScriptGenerationOptions } from '../ports/IScriptGenerationPort';
import { WebsiteAnalysis, BusinessCategory, PromoScriptPlan, isBusinessCategory } from '../domain/entities/WebsitePromo';

// Type for the existing LLM client
interface LegacyLlmClient {
    generatePromoScript(
        websiteAnalysis: any,
        category: string,
        options?: { language?: string }
    ): Promise<any>;
    detectCategory?(keywords: string[]): Promise<string>;
}

export class ScriptGenerationAdapter implements IScriptGenerationPort {
    constructor(private readonly llmClient: LegacyLlmClient) { }

    async generateScript(options: ScriptGenerationOptions): Promise<PromoScriptPlan> {
        const result = await this.llmClient.generatePromoScript(
            options.websiteAnalysis,
            options.category,
            { language: options.language }
        );

        // Map legacy result to slice domain model
        return {
            coreMessage: result.coreMessage || '',
            hookType: result.hookType,
            category: options.category,
            businessName: result.businessName || options.websiteAnalysis.detectedBusinessName || 'Business',
            scenes: (result.scenes || []).map((s: any) => ({
                duration: s.duration || 5,
                imagePrompt: s.imagePrompt || '',
                narration: s.narration || '',
                subtitle: s.subtitle || s.narration || '',
                role: s.role || 'showcase',
                visualStyle: s.visualStyle
            })),
            musicStyle: result.musicStyle || 'upbeat',
            caption: result.caption || '',
            compliance: {
                source: 'public-website',
                consent: true,
                scrapedAt: new Date()
            },
            language: options.language,
            logoUrl: result.logoUrl,
            logoPosition: result.logoPosition
        };
    }

    async detectCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory> {
        if (this.llmClient.detectCategory) {
            const result = await this.llmClient.detectCategory(analysis.keywords);
            if (isBusinessCategory(result)) {
                return result;
            }
        }

        // Fallback: keyword-based detection
        const keywords = analysis.keywords.join(' ').toLowerCase();
        if (keywords.includes('restaurant') || keywords.includes('food')) return 'restaurant';
        if (keywords.includes('cafe') || keywords.includes('coffee')) return 'cafe';
        if (keywords.includes('gym') || keywords.includes('fitness')) return 'gym';
        if (keywords.includes('tech') || keywords.includes('software')) return 'tech';
        if (keywords.includes('agency') || keywords.includes('marketing')) return 'agency';

        return 'service'; // Default
    }
}
