import axios from 'axios';
import { IWebsiteScraperClient } from '../../domain/ports/IWebsiteScraperClient';
import { WebsiteAnalysis } from '../../domain/entities/WebsitePromo';

/**
 * Website scraper client using axios + cheerio for HTML parsing.
 * Extracts business information from public websites for promo reel generation.
 */
export class WebsiteScraperClient implements IWebsiteScraperClient {
    private readonly timeout: number;
    private readonly userAgent: string;

    constructor(options?: { timeout?: number; userAgent?: string }) {
        this.timeout = options?.timeout ?? 10000;
        this.userAgent = options?.userAgent ?? 'ReelBot/1.0 (+https://challenging-view.com)';
    }

    /**
     * Scrapes a website for business information.
     */
    async scrapeWebsite(url: string): Promise<WebsiteAnalysis> {
        if (!url || !this.isValidUrl(url)) {
            throw new Error('Invalid website URL provided');
        }

        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: this.timeout,
                maxRedirects: 5,
            });

            const html = response.data;
            return this.parseHtml(html, url);
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.code === 'ECONNABORTED') {
                    throw new Error(`Website scraping timed out after ${this.timeout}ms`);
                }
                if (error.response?.status === 403) {
                    throw new Error('Website blocked scraping (403 Forbidden)');
                }
                if (error.response?.status === 404) {
                    throw new Error('Website not found (404)');
                }
                throw new Error(`Failed to scrape website: ${error.message}`);
            }
            throw error;
        }
    }

    /**
     * Parses HTML content to extract business information.
     * Note: This is a lightweight implementation without cheerio dependency.
     * For production, consider adding cheerio for more robust parsing.
     */
    private parseHtml(html: string, sourceUrl: string): WebsiteAnalysis {
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? this.cleanText(titleMatch[1]) : '';

        // Extract H1 (first one)
        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const h1Text = h1Match ? this.cleanText(h1Match[1]) : '';

        // Extract meta description
        const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        const metaDescription = metaDescMatch ? this.cleanText(metaDescMatch[1]) : '';

        // Extract og:site_name for business name
        const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
        const ogSiteName = ogSiteNameMatch ? this.cleanText(ogSiteNameMatch[1]) : '';

        // Get hero text (prefer H1, fallback to title)
        const heroText = h1Text || title;

        // Extract keywords from body text for category detection
        const bodyText = this.extractBodyText(html).toLowerCase();
        const keywords = this.extractKeywords(bodyText);

        // Detect business name
        const detectedBusinessName = this.detectBusinessName(ogSiteName, title, heroText);

        // Detect location
        const detectedLocation = this.detectLocation(bodyText);

        return {
            heroText,
            metaDescription,
            keywords,
            detectedBusinessName,
            detectedLocation,
            sourceUrl,
        };
    }

    /**
     * Extracts readable text from HTML body.
     */
    private extractBodyText(html: string): string {
        // Remove script and style tags
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        // Remove all HTML tags
        text = text.replace(/<[^>]+>/g, ' ');
        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();
        return text;
    }

    /**
     * Extracts category-relevant keywords from text.
     */
    private extractKeywords(text: string): string[] {
        const categoryKeywordMap: Record<string, string[]> = {
            cafe: ['coffee', 'cafe', 'café', 'espresso', 'latte', 'cappuccino', 'barista', 'roast', 'brew'],
            gym: ['gym', 'fitness', 'training', 'workout', 'exercise', 'weights', 'cardio', 'personal trainer'],
            shop: ['shop', 'store', 'buy', 'products', 'retail', 'boutique', 'gifts', 'handmade'],
            restaurant: ['restaurant', 'dining', 'menu', 'chef', 'cuisine', 'food', 'dishes', 'kitchen'],
            studio: ['studio', 'creative', 'photography', 'art', 'design', 'recording', 'space'],
            service: ['service', 'professional', 'expert', 'consultation', 'booking', 'appointment'],
        };

        const allKeywords = Object.values(categoryKeywordMap).flat();
        return allKeywords.filter(kw => text.includes(kw));
    }

    /**
     * Detects business name from various sources.
     */
    private detectBusinessName(
        ogSiteName: string,
        title: string,
        heroText: string
    ): string | undefined {
        // Prefer og:site_name
        if (ogSiteName) {
            return ogSiteName;
        }

        // Try to extract from title (often "Business Name | Tagline" or "Business Name - Location")
        if (title) {
            const parts = title.split(/[|\-–—]/);
            if (parts.length > 0) {
                return parts[0].trim();
            }
        }

        // Fallback to hero text if short enough
        if (heroText && heroText.length < 50) {
            return heroText;
        }

        return undefined;
    }

    /**
     * Detects location from text content.
     */
    private detectLocation(text: string): string | undefined {
        // Berlin-specific districts
        const berlinDistricts = [
            'kreuzberg', 'neukölln', 'mitte', 'prenzlauer berg', 'friedrichshain',
            'charlottenburg', 'schöneberg', 'wedding', 'tempelhof', 'steglitz',
        ];

        for (const district of berlinDistricts) {
            if (text.includes(district)) {
                return district.charAt(0).toUpperCase() + district.slice(1);
            }
        }

        // Generic "berlin" detection
        if (text.includes('berlin')) {
            return 'Berlin';
        }

        return undefined;
    }

    /**
     * Cleans extracted text by removing extra whitespace and decoding HTML entities.
     */
    private cleanText(text: string): string {
        return text
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Validates URL format.
     */
    private isValidUrl(url: string): boolean {
        try {
            const parsed = new URL(url);
            return parsed.protocol === 'http:' || parsed.protocol === 'https:';
        } catch {
            return false;
        }
    }
}
