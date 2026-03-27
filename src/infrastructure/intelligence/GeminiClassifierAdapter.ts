import { GeminiService } from '../llm/GeminiService';
export interface WebOrganizerResult {
    topic: string;
    format: string;
    confidence: number;
    error?: string;
}

/**
 * Gemini-based classifier that replaces the heavy Python/Transformers classifier.
 * Leverages Gemini 1.5 Flash for high-speed, cost-effective inference.
 */
export class GeminiClassifierAdapter {
    private geminiService: GeminiService;

    constructor(apiKey: string) {
        if (!apiKey) {
            throw new Error('Gemini API key is required for classification');
        }
        // Use flash for speed and cost efficiency (it's often free under certain limits)
        this.geminiService = new GeminiService(apiKey, 'gemini-1.5-flash');
    }

    async classify(mainText: string, metadata: any = {}): Promise<WebOrganizerResult> {
        const prompt = `
Analyze the following website content and classify it by Topic and Format.

WEBSITE CONTENT:
${mainText}

METADATA:
${JSON.stringify(metadata)}

POSSIBLE TOPICS:
- Science & Technology
- Finance/Business
- Home/Hobbies
- Health/Medicine
- Arts/Entertainment
- News/Media
- Other

POSSIBLE FORMATS:
- Landing Page (Standard product/service page)
- Ecommerce Store (Product listings, cart, buy buttons)
- Portfolio (Personal work, resume, case studies)
- Local Service (Office, clinic, restaurant, business hours)
- Blog/News (Articles, posts, publications)

Return JSON format:
{
  "topic": "Selected Topic",
  "format": "Selected Format",
  "confidence": 0.0-1.0,
  "reason": "Brief explanation"
}
`;

        try {
            const systemPrompt = 'You are a precise website classifier. Return only JSON.';
            const response = await this.geminiService.chatCompletion(prompt, systemPrompt, {
                jsonMode: true,
                temperature: 0.1 // Low temperature for consistent classification
            });

            const result = this.geminiService.parseJSON<any>(response);

            return {
                topic: result.topic || 'Unknown',
                format: result.format || 'Unknown',
                confidence: result.confidence || 0.8,
            };
        } catch (error) {
            console.error('[GeminiClassifier] Classification failed:', error);
            return {
                topic: 'Unknown',
                format: 'Unknown',
                confidence: 0,
                error: `Gemini classification failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}
