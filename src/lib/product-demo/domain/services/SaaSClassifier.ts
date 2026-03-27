/**
 * SaaS Classifier Domain Service
 * 
 * Determines if a product URL is eligible for demo video generation.
 * Uses LLM-powered classification to detect SaaS products.
 */

import { SaaSEligibilityResult, ProductType, ProductAnalysis } from '../entities/ProductDemo';

// ============================================================================
// Classification Prompts
// ============================================================================

export const SAAS_CLASSIFICATION_PROMPT = `You are a product classification expert. Analyze the following website content and determine if it's a SaaS (Software as a Service) product.

WEBSITE CONTENT:
{{content}}

Classify this product into one of these categories:
- saas: Web-based software accessed via subscription (e.g., Notion, Linear, Figma)
- ecommerce: Online store selling physical or digital products
- info_product: Courses, ebooks, coaching services
- physical: Physical product company
- service: Agency, consulting, professional services
- unknown: Cannot determine

For this MVP, we ONLY support SaaS products. A SaaS product typically has:
1. Web-based software accessible via browser
2. Subscription or usage-based pricing
3. User accounts and dashboards
4. Clear value proposition solving a specific problem

Respond in JSON format:
{
    "productType": "saas|ecommerce|info_product|physical|service|unknown",
    "isEligible": true|false,
    "reason": "Brief explanation of your classification",
    "confidence": 0.0-1.0,
    "detectedProblem": "What problem does this product solve (if SaaS)",
    "requiresAuth": true|false
}`;

// ============================================================================
// SaaS Classifier
// ============================================================================

export class SaaSClassifier {
    /**
     * Builds the classification prompt with product content.
     */
    buildPrompt(analysis: ProductAnalysis): string {
        const content = `
Product Name: ${analysis.productName}
Tagline: ${analysis.tagline || 'N/A'}
Description: ${analysis.metaDescription || 'N/A'}
Features: ${analysis.features.join(', ') || 'N/A'}
Pricing Model: ${analysis.pricingModel || 'unknown'}
Requires Auth: ${analysis.requiresAuth}
Has Demo Button: ${analysis.demoButton?.found || false}
Target Audience: ${analysis.targetAudience || 'N/A'}
`.trim();

        return SAAS_CLASSIFICATION_PROMPT.replace('{{content}}', content);
    }

    /**
     * Parses LLM response into eligibility result.
     */
    parseResponse(response: string): SaaSEligibilityResult {
        try {
            // Extract JSON from response (handle markdown code blocks)
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                return this.createFallbackResult('Could not parse classification response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                isEligible: parsed.isEligible === true && parsed.productType === 'saas',
                productType: this.normalizeProductType(parsed.productType),
                reason: parsed.reason || 'Classification complete',
                confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
                detectedProblem: parsed.detectedProblem,
                requiresAuth: parsed.requiresAuth
            };
        } catch (error) {
            return this.createFallbackResult('Failed to parse classification response');
        }
    }

    /**
     * Creates rejection message for non-eligible products.
     */
    createRejectionMessage(result: SaaSEligibilityResult): string {
        const typeMessages: Record<ProductType, string> = {
            saas: 'This appears to be a SaaS product but we could not verify eligibility.',
            ecommerce: 'E-commerce stores are not yet supported. We currently only support SaaS products.',
            info_product: 'Info products (courses, ebooks) are not yet supported. We currently only support SaaS products.',
            physical: 'Physical product companies are not yet supported. We currently only support SaaS products.',
            service: 'Service-based businesses are not yet supported. We currently only support SaaS products.',
            unknown: 'We could not determine the product type. Please ensure the URL points to a SaaS product.'
        };

        return `Unable to generate demo video: ${typeMessages[result.productType]} (Confidence: ${Math.round(result.confidence * 100)}%)`;
    }

    private normalizeProductType(type: string): ProductType {
        const normalized = type?.toLowerCase();
        const validTypes: ProductType[] = ['saas', 'ecommerce', 'info_product', 'physical', 'service', 'unknown'];
        return validTypes.includes(normalized as ProductType) ? (normalized as ProductType) : 'unknown';
    }

    private createFallbackResult(reason: string): SaaSEligibilityResult {
        return {
            isEligible: false,
            productType: 'unknown',
            reason,
            confidence: 0
        };
    }
}
