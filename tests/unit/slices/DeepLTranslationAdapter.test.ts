/**
 * Unit Tests for DeepL Translation Adapter
 */

import { MockTranslationAdapter } from '../../../src/slices/website-promo/adapters/DeepLTranslationAdapter';

describe('MockTranslationAdapter', () => {
    let adapter: MockTranslationAdapter;

    beforeEach(() => {
        adapter = new MockTranslationAdapter();
    });

    describe('translate', () => {
        it('should prefix text with target language code', async () => {
            const result = await adapter.translate('Hello world', 'DE');

            expect(result.translatedText).toBe('[DE] Hello world');
            expect(result.detectedSourceLanguage).toBe('EN');
        });

        it('should handle empty text', async () => {
            const result = await adapter.translate('', 'FR');

            expect(result.translatedText).toBe('[FR] ');
        });
    });

    describe('translateBatch', () => {
        it('should translate multiple texts', async () => {
            const texts = ['Hello', 'World', 'Test'];
            const results = await adapter.translateBatch(texts, 'ES');

            expect(results).toHaveLength(3);
            expect(results[0].translatedText).toBe('[ES] Hello');
            expect(results[1].translatedText).toBe('[ES] World');
            expect(results[2].translatedText).toBe('[ES] Test');
        });

        it('should handle empty array', async () => {
            const results = await adapter.translateBatch([], 'IT');

            expect(results).toHaveLength(0);
        });
    });
});
