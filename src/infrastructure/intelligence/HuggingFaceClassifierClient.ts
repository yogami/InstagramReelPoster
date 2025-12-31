/**
 * HuggingFace Inference API Client for Web Classification
 * 
 * Uses Zero-Shot Classification with GPU inference.
 * Target: 82% F1 accuracy
 */

import axios from 'axios';

export interface HuggingFaceClassificationResult {
    type: string;
    confidence: number;
    allScores: Record<string, number>;
    error?: string;
}

export class HuggingFaceClassifierClient {
    private readonly apiKey: string;
    private readonly baseUrl: string;
    private readonly model: string;
    private readonly timeoutMs: number;

    // Site type labels for zero-shot classification
    private readonly labels = [
        'personal portfolio website',
        'software as a service landing page',
        'online shopping e-commerce store',
        'local business or service provider',
        'blog or news publication',
        'online course or educational platform'
    ];

    // Map verbose labels to our SiteType enum
    private readonly labelToType: Record<string, string> = {
        'personal portfolio website': 'PORTFOLIO',
        'software as a service landing page': 'SAAS_LANDING',
        'online shopping e-commerce store': 'ECOMMERCE',
        'local business or service provider': 'LOCAL_SERVICE',
        'blog or news publication': 'BLOG',
        'online course or educational platform': 'COURSE'
    };

    constructor(
        apiKey?: string,
        model: string = 'facebook/bart-large-mnli',
        timeoutMs: number = 30000
    ) {
        this.apiKey = apiKey || process.env.HUGGINGFACE_API_KEY || '';
        // Updated: HuggingFace migrated from api-inference to router
        this.baseUrl = 'https://router.huggingface.co/hf-inference/models';
        this.model = model;
        this.timeoutMs = timeoutMs;

        if (!this.apiKey) {
            console.warn('[HuggingFace] No API key provided. Set HUGGINGFACE_API_KEY env var.');
        }
    }

    /**
     * Classify website content using zero-shot classification.
     */
    async classify(text: string): Promise<HuggingFaceClassificationResult> {
        if (!this.apiKey) {
            return {
                type: 'SAAS_LANDING',
                confidence: 0,
                allScores: {},
                error: 'No HuggingFace API key configured'
            };
        }

        // Clean and truncate text for API
        const cleanedText = this.cleanText(text);

        try {
            console.log('[HuggingFace] Classifying with zero-shot...');
            const startTime = Date.now();

            const response = await axios.post(
                `${this.baseUrl}/${this.model}`,
                {
                    inputs: cleanedText,
                    parameters: {
                        candidate_labels: this.labels,
                        multi_label: false
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: this.timeoutMs
                }
            );

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
            console.log(`[HuggingFace] Classification completed in ${elapsed}s`);

            // Parse response
            const result = response.data;
            if (result.error) {
                throw new Error(result.error);
            }

            // HuggingFace returns array of {label, score} objects, sorted by score descending
            const allScores: Record<string, number> = {};

            // Handle array response format: [{label: "...", score: 0.xx}, ...]
            if (Array.isArray(result)) {
                for (const item of result) {
                    const siteType = this.labelToType[item.label] || 'OTHER';
                    allScores[siteType] = item.score || 0;
                }

                // Best match is first item (highest score)
                const bestItem = result[0] || { label: 'unknown', score: 0 };
                const bestType = this.labelToType[bestItem.label] || 'SAAS_LANDING';
                const bestScore = bestItem.score || 0;

                console.log(`[HuggingFace] Result: ${bestType} (${(bestScore * 100).toFixed(1)}%)`);

                return {
                    type: bestType,
                    confidence: bestScore,
                    allScores
                };
            }

            // Legacy format: {labels: [...], scores: [...]}
            const labels = result.labels || [];
            const scores = result.scores || [];

            for (let i = 0; i < labels.length; i++) {
                const siteType = this.labelToType[labels[i]] || 'OTHER';
                allScores[siteType] = scores[i] || 0;
            }

            // Best match
            const bestLabel = labels[0];
            const bestScore = scores[0] || 0;
            const bestType = this.labelToType[bestLabel] || 'SAAS_LANDING';

            console.log(`[HuggingFace] Result: ${bestType} (${(bestScore * 100).toFixed(1)}%)`);

            return {
                type: bestType,
                confidence: bestScore,
                allScores
            };

        } catch (error: any) {
            const message = error.response?.data?.error || error.message;
            console.error('[HuggingFace] Classification failed:', message);

            // Check for model loading (cold start)
            if (message?.includes('loading')) {
                console.log('[HuggingFace] Model is loading, retrying in 20s...');
                await new Promise(r => setTimeout(r, 20000));
                return this.classify(text); // Retry once
            }

            return {
                type: 'SAAS_LANDING',
                confidence: 0,
                allScores: {},
                error: message
            };
        }
    }

    /**
     * Clean text for classification - remove noise, truncate.
     */
    private cleanText(text: string): string {
        return text
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .replace(/[^\w\s.,!?-]/g, ' ')  // Remove special chars
            .trim()
            .substring(0, 1000);            // API limit ~1024 tokens
    }
}
