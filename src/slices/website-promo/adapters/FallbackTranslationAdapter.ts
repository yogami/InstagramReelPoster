import { ITranslationPort, SupportedLanguage, TranslationResult } from '../ports/ITranslationPort';

/**
 * Fallback Translation Adapter
 * 
 * Implements the fallback pattern for translation services.
 * If the primary provider (e.g., DeepL) fails or returns an error,
 * it falls back to the secondary provider (e.g., Google or NoOp).
 */
export class FallbackTranslationAdapter implements ITranslationPort {
    constructor(
        private readonly primary: ITranslationPort,
        private readonly secondary: ITranslationPort,
        private readonly primaryName: string = 'Primary',
        private readonly secondaryName: string = 'Secondary'
    ) { }

    async translate(
        text: string,
        targetLang: SupportedLanguage,
        sourceLang?: SupportedLanguage
    ): Promise<TranslationResult> {
        try {
            return await this.primary.translate(text, targetLang, sourceLang);
        } catch (error) {
            console.warn(`[${this.primaryName}] Translation failed, falling back to ${this.secondaryName}:`, error);
            return await this.secondary.translate(text, targetLang, sourceLang);
        }
    }

    async translateBatch(
        texts: string[],
        targetLang: SupportedLanguage,
        sourceLang?: SupportedLanguage
    ): Promise<TranslationResult[]> {
        try {
            return await this.primary.translateBatch(texts, targetLang, sourceLang);
        } catch (error) {
            console.warn(`[${this.primaryName}] Batch translation failed, falling back to ${this.secondaryName}:`, error);
            return await this.secondary.translateBatch(texts, targetLang, sourceLang);
        }
    }
}

/**
 * No-Op Translation Adapter
 * 
 * Returns the original text. Useful as an ultimate fallback to prevent pipeline failure.
 */
export class NoOpTranslationAdapter implements ITranslationPort {
    async translate(text: string): Promise<TranslationResult> {
        return { translatedText: text };
    }

    async translateBatch(texts: string[]): Promise<TranslationResult[]> {
        return texts.map(t => ({ translatedText: t }));
    }
}
