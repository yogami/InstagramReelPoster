/**
 * DeepL Translation Adapter
 * 
 * Implements ITranslationPort using the DeepL API.
 * Free tier: 500,000 characters/month.
 */

import axios from 'axios';
import { ITranslationPort, SupportedLanguage, TranslationResult } from '../ports/ITranslationPort';

export class DeepLTranslationAdapter implements ITranslationPort {
    private readonly apiKey: string;
    private readonly baseUrl: string;

    constructor(apiKey: string, useFreeApi: boolean = true) {
        this.apiKey = apiKey;
        // DeepL has different endpoints for free vs pro
        this.baseUrl = useFreeApi
            ? 'https://api-free.deepl.com/v2'
            : 'https://api.deepl.com/v2';
    }

    async translate(
        text: string,
        targetLang: SupportedLanguage,
        sourceLang?: SupportedLanguage
    ): Promise<TranslationResult> {
        const results = await this.translateBatch([text], targetLang, sourceLang);
        return results[0];
    }

    async translateBatch(
        texts: string[],
        targetLang: SupportedLanguage,
        sourceLang?: SupportedLanguage
    ): Promise<TranslationResult[]> {
        if (texts.length === 0) {
            return [];
        }

        try {
            const params = new URLSearchParams();
            texts.forEach(text => params.append('text', text));
            params.append('target_lang', targetLang);
            if (sourceLang) {
                params.append('source_lang', sourceLang);
            }

            const response = await axios.post(
                `${this.baseUrl}/translate`,
                params,
                {
                    headers: {
                        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    // DeepL expects array of texts as multiple 'text' params
                    paramsSerializer: { indexes: null }
                }
            );

            // Handle the actual DeepL response format
            const translations = response.data.translations as Array<{
                detected_source_language: string;
                text: string;
            }>;

            return translations.map(t => ({
                translatedText: t.text,
                detectedSourceLanguage: t.detected_source_language
            }));
        } catch (error: any) {
            console.error('[DeepL] Translation failed:', error.response?.data || error.message);
            throw new Error(`Translation failed: ${error.message}`);
        }
    }
}

/**
 * Mock Translation Adapter for testing/development without API key.
 */
export class MockTranslationAdapter implements ITranslationPort {
    async translate(text: string, targetLang: SupportedLanguage): Promise<TranslationResult> {
        console.log(`[MockTranslation] Would translate to ${targetLang}: "${text.substring(0, 50)}..."`);
        return {
            translatedText: `[${targetLang}] ${text}`,
            detectedSourceLanguage: 'EN'
        };
    }

    async translateBatch(texts: string[], targetLang: SupportedLanguage): Promise<TranslationResult[]> {
        return Promise.all(texts.map(t => this.translate(t, targetLang)));
    }
}
