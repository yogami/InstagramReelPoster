import { WebsiteAnalysis } from '../entities/WebsitePromo';
import { ILlmClient } from '../ports/ILlmClient';
import { EXTRACT_CONTACT_INFO_PROMPT } from '../../infrastructure/llm/Prompts';

/**
 * Service for sophisticated website intelligence using LLMs.
 * Handles high-accuracy contact extraction and business analysis.
 */
export class WebsiteIntelligenceService {
    private readonly llm: ILlmClient;

    constructor(llm: ILlmClient) {
        this.llm = llm;
    }

    /**
     * Extracts structured contact info from raw website text using LLM.
     * This replaces simple regex with sophisticated semantic parsing.
     */
    public async extractSophisticatedContactInfo(rawText: string): Promise<Partial<WebsiteAnalysis>> {
        if (!rawText || rawText.length < 50) {
            console.warn('[Intelligence] No raw text provided for extraction, skipping LLM pass');
            return {};
        }

        console.log('[Intelligence] Running LLM-based contact extraction...');
        const prompt = EXTRACT_CONTACT_INFO_PROMPT.replace('{{scrapedText}}', rawText);

        try {
            const response = await this.llm.generateText(prompt);
            // Heuristic for JSON parsing since Gemini prompt asks for JSON
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) return {};
            const data = JSON.parse(jsonMatch[0]);

            if (!data) return {};

            return {
                detectedBusinessName: data.businessName || undefined,
                phone: data.phone || undefined,
                email: data.email || undefined,
                address: data.address || undefined,
                openingHours: data.openingHours || undefined,
                socialLinks: data.socials ? {
                    instagram: data.socials.instagram || undefined,
                    facebook: data.socials.facebook || undefined
                } : undefined
            };
        } catch (error) {
            console.error('[Intelligence] LLM extraction failed:', error);
            return {};
        }
    }
}
