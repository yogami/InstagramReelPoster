/**
 * Translation Port Interface
 * 
 * Defines the contract for translation services (e.g., DeepL, Google Translate).
 * Used to translate generated content into target languages.
 */

export type SupportedLanguage = 'DE' | 'EN' | 'FR' | 'ES' | 'IT' | 'PT' | 'NL' | 'PL' | 'RU' | 'JA' | 'ZH';

export interface TranslationResult {
    translatedText: string;
    detectedSourceLanguage?: string;
}

export interface ITranslationPort {
    /**
     * Translates text to the target language.
     * @param text - The text to translate
     * @param targetLang - Target language code (e.g., 'DE', 'EN')
     * @param sourceLang - Optional source language (auto-detected if not provided)
     */
    translate(text: string, targetLang: SupportedLanguage, sourceLang?: SupportedLanguage): Promise<TranslationResult>;

    /**
     * Translates multiple texts in a single batch request.
     * More efficient for translating multiple segments.
     */
    translateBatch(texts: string[], targetLang: SupportedLanguage, sourceLang?: SupportedLanguage): Promise<TranslationResult[]>;
}
