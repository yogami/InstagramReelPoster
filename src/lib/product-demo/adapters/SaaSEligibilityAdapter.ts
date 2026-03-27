/**
 * SaaS Eligibility Adapter
 * 
 * LLM-powered adapter for determining if a URL is an eligible SaaS product.
 * Uses the SaaSClassifier domain service.
 */

import { ISaaSEligibilityPort } from '../ports/ISaaSEligibilityPort';
import { SaaSEligibilityResult, ProductAnalysis } from '../domain/entities/ProductDemo';
import { SaaSClassifier } from '../domain/services/SaaSClassifier';
import { IProductScrapingPort } from '../ports/IProductScrapingPort';

export interface SaaSEligibilityAdapterDeps {
    /** LLM client for classification */
    llmClient: {
        generateText(prompt: string): Promise<string>;
    };
    /** Product scraping port for initial analysis */
    productScrapingPort: IProductScrapingPort;
}

export class SaaSEligibilityAdapter implements ISaaSEligibilityPort {
    private readonly classifier = new SaaSClassifier();

    constructor(private readonly deps: SaaSEligibilityAdapterDeps) { }

    async checkEligibility(url: string): Promise<SaaSEligibilityResult> {
        try {
            console.log(`[SaaSEligibility] Checking eligibility for: ${url}`);

            // First, scrape basic product info
            const analysis = await this.deps.productScrapingPort.scrapeProduct({
                url,
                captureScreenshots: false,
                extractImages: false
            });

            // Build classification prompt
            const prompt = this.classifier.buildPrompt(analysis);

            // Get LLM classification
            const response = await this.deps.llmClient.generateText(prompt);

            // Parse response
            const result = this.classifier.parseResponse(response);

            console.log(`[SaaSEligibility] Result: ${result.isEligible ? 'ELIGIBLE' : 'NOT ELIGIBLE'} (${result.productType}, ${Math.round(result.confidence * 100)}%)`);

            return result;
        } catch (error) {
            console.error('[SaaSEligibility] Error checking eligibility:', error);
            return {
                isEligible: false,
                productType: 'unknown',
                reason: `Failed to analyze URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
                confidence: 0
            };
        }
    }
}
