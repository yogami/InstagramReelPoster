/**
 * Beam.cloud Web Classifier Client
 * 
 * Calls the deployed T5+MoE classifier endpoint on Beam.cloud GPU.
 * Target: 80%+ F1 accuracy
 */

import axios from 'axios';

export interface BeamClassifierResult {
    type: string;
    confidence: number;
    allScores: Record<string, number>;
    model?: string;
    error?: string;
}

export class BeamcloudClassifierClient {
    private readonly apiKey: string;
    private readonly endpointUrl: string;
    private readonly timeoutMs: number;

    constructor(
        apiKey?: string,
        endpointUrl?: string,
        timeoutMs: number = 60000 // 60s for cold starts
    ) {
        this.apiKey = apiKey || process.env.BEAM_API_KEY || '';
        // Default to the deployed web-classifier endpoint
        this.endpointUrl = endpointUrl || process.env.BEAM_CLASSIFIER_URL ||
            'https://app.beam.cloud/endpoint/web-classifier';
        this.timeoutMs = timeoutMs;

        if (!this.apiKey) {
            console.warn('[BeamClassifier] No API key. Set BEAM_API_KEY env var.');
        }
    }

    /**
     * Classify website content using Beam.cloud GPU endpoint.
     */
    async classify(text: string, title: string = '', url: string = ''): Promise<BeamClassifierResult> {
        if (!this.apiKey) {
            return {
                type: 'SAAS_LANDING',
                confidence: 0,
                allScores: {},
                error: 'No Beam.cloud API key configured'
            };
        }

        try {
            console.log('[BeamClassifier] Classifying with Beam.cloud GPU...');
            const startTime = Date.now();

            const response = await axios.post(
                this.endpointUrl,
                {
                    text: text.substring(0, 2000), // Limit to avoid token overflow
                    title,
                    url
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
            console.log(`[BeamClassifier] Classification completed in ${elapsed}s`);

            const result = response.data;

            if (result.error) {
                throw new Error(result.error);
            }

            console.log(`[BeamClassifier] Result: ${result.type} (${(result.confidence * 100).toFixed(1)}%)`);

            return {
                type: result.type,
                confidence: result.confidence,
                allScores: result.all_scores || {},
                model: result.model
            };

        } catch (error: any) {
            const message = error.response?.data?.error || error.message;
            console.error('[BeamClassifier] Classification failed:', message);

            // Check for cold start / loading
            if (message?.includes('loading') || error.code === 'ECONNABORTED') {
                console.log('[BeamClassifier] Endpoint warming up, retrying in 15s...');
                await new Promise(r => setTimeout(r, 15000));
                return this.classify(text, title, url); // Retry once
            }

            return {
                type: 'SAAS_LANDING',
                confidence: 0,
                allScores: {},
                error: message
            };
        }
    }
}
