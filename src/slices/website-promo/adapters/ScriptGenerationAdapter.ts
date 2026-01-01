/**
 * Script Generation Adapter
 * 
 * Bridges the slice's IScriptGenerationPort to the existing LLM infrastructure.
 */

import { IScriptGenerationPort, ScriptGenerationOptions } from '../ports/IScriptGenerationPort';
import { WebsiteAnalysis, BusinessCategory, PromoScriptPlan, isBusinessCategory } from '../domain/entities/WebsitePromo';
import { ILlmClient } from '../../../domain/ports/ILlmClient';

export class ScriptGenerationAdapter implements IScriptGenerationPort {
    constructor(private readonly llmClient: ILlmClient) { }

    async generateScript(options: ScriptGenerationOptions): Promise<PromoScriptPlan> {
        if (!this.llmClient.generatePromoScript) {
            throw new Error('LLM client does not support promo script generation');
        }

        return await this.llmClient.generatePromoScript(
            options.websiteAnalysis,
            options.category,
            options.language
        );
    }

    async detectCategory(analysis: WebsiteAnalysis): Promise<BusinessCategory> {
        if (this.llmClient.detectBusinessCategory) {
            const result = await this.llmClient.detectBusinessCategory(analysis);
            if (isBusinessCategory(result)) {
                return result;
            }
        }

        // Fallback: keyword-based detection
        const keywords = (analysis.keywords || []).join(' ').toLowerCase();
        if (keywords.includes('restaurant') || keywords.includes('food')) return 'restaurant';
        if (keywords.includes('cafe') || keywords.includes('coffee')) return 'cafe';
        if (keywords.includes('gym') || keywords.includes('fitness')) return 'gym';
        if (keywords.includes('tech') || keywords.includes('software')) return 'tech';
        if (keywords.includes('agency') || keywords.includes('marketing')) return 'agency';

        return 'service'; // Default
    }
}
