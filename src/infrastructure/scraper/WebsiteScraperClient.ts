import axios from 'axios';
import { IWebsiteScraperClient, ScrapeOptions } from '../../domain/ports/IWebsiteScraperClient';
import {
    WebsiteAnalysis,
    PricingContent,
    TestimonialsContent,
    ScrapedMedia,
} from '../../domain/entities/WebsitePromo';

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
    async scrapeWebsite(url: string, options?: ScrapeOptions): Promise<WebsiteAnalysis> {
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
            const analysis = this.parseHtml(html, url);

            // Extract images for prioritized sourcing
            analysis.scrapedMedia = this.extractImages(html, url);

            if (options?.includeSubpages) {
                await this.scrapeSubpages(url, analysis);
            }

            return analysis;
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
     * Scrapes subpages (/about, /pricing, /testimonials) with error tolerance.
     */
    private async scrapeSubpages(baseUrl: string, analysis: WebsiteAnalysis): Promise<void> {
        const base = new URL(baseUrl);
        const baseOrigin = base.origin;

        const subpagePromises = [
            this.scrapeSubpage(`${baseOrigin}/about`),
            this.scrapeSubpage(`${baseOrigin}/pricing`),
            this.scrapeSubpage(`${baseOrigin}/testimonials`),
        ];

        const [aboutHtml, pricingHtml, testimonialsHtml] = await Promise.all(subpagePromises);

        if (aboutHtml) {
            analysis.aboutContent = this.extractBodyText(aboutHtml);
        }

        if (pricingHtml) {
            analysis.pricingContent = this.extractPricingContent(pricingHtml);
        }

        if (testimonialsHtml) {
            analysis.testimonialsContent = this.extractTestimonials(testimonialsHtml);
        }
    }

    /**
     * Scrapes a subpage with error tolerance (returns null on failure).
     */
    private async scrapeSubpage(url: string): Promise<string | null> {
        try {
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                timeout: this.timeout,
                maxRedirects: 3,
            });
            return response.data;
        } catch {
            return null;
        }
    }

    /**
     * Extracts pricing content from pricing page HTML.
     */
    private extractPricingContent(html: string): PricingContent {
        const rawText = this.extractBodyText(html);
        const painPoints = this.extractPainPoints(rawText);
        const pricingTiers = this.extractPricingTiers(html);

        return {
            painPoints,
            pricingTiers,
            rawText,
        };
    }

    /**
     * Extracts pain points from text content.
     */
    private extractPainPoints(text: string): string[] {
        const painPhrases = [
            /tired\s+of\s+([^.?!]+)/gi,
            /frustrated\s+with\s+([^.?!]+)/gi,
            /struggling\s+to\s+([^.?!]+)/gi,
            /wasting\s+([^.?!]+)/gi,
            /losing\s+([^.?!]+)/gi,
        ];

        const painPoints: string[] = [];
        for (const phrase of painPhrases) {
            let match;
            while ((match = phrase.exec(text)) !== null) {
                painPoints.push(match[0].trim());
            }
        }

        return painPoints;
    }

    /**
     * Extracts pricing tiers from HTML.
     */
    private extractPricingTiers(html: string): string[] {
        const tiers: string[] = [];
        const tierPattern = /\$\d+(?:\.\d{2})?(?:\/(?:mo|month|yr|year))?/gi;
        let match;
        while ((match = tierPattern.exec(html)) !== null) {
            tiers.push(match[0]);
        }
        return tiers;
    }

    /**
     * Extracts testimonial content from testimonials page HTML.
     */
    private extractTestimonials(html: string): TestimonialsContent {
        const rawText = this.extractBodyText(html);
        const quotes = this.extractQuotes(html);
        const starRatings = this.extractStarRatings(rawText);
        const clientCounts = this.extractClientCounts(rawText);
        const pressMentions = this.extractPressMentions(rawText);

        return {
            quotes,
            starRatings,
            clientCounts,
            pressMentions,
        };
    }

    /**
     * Extracts quotes from testimonial HTML.
     */
    private extractQuotes(html: string): string[] {
        const quotes: string[] = [];

        const blockquotePattern = /<blockquote[^>]*>([^<]+)<\/blockquote>/gi;
        let match;
        while ((match = blockquotePattern.exec(html)) !== null) {
            quotes.push(this.cleanText(match[1]));
        }

        const quotePattern = /"([^"]{20,200})"/g;
        const text = this.extractBodyText(html);
        while ((match = quotePattern.exec(text)) !== null) {
            if (!quotes.includes(match[1])) {
                quotes.push(match[1]);
            }
        }

        return quotes;
    }

    /**
     * Extracts star ratings from text.
     */
    private extractStarRatings(text: string): string[] {
        const ratings: string[] = [];
        const patterns = [
            /\d+(?:\.\d+)?\s*(?:out\s+of\s+)?\/?5\s*stars?/gi,
            /\d+(?:\.\d+)?\/5/gi,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const rating = match[0].trim();
                if (!ratings.includes(rating)) {
                    ratings.push(rating);
                }
            }
        }

        return ratings;
    }

    /**
     * Extracts client count mentions from text.
     */
    private extractClientCounts(text: string): string[] {
        const counts: string[] = [];
        const pattern = /\d+\+?\s*(?:satisfied|happy)?\s*(?:clients?|customers?|users?)/gi;

        let match;
        while ((match = pattern.exec(text)) !== null) {
            counts.push(match[0].trim());
        }

        return counts;
    }

    /**
     * Extracts press mentions from text.
     */
    private extractPressMentions(text: string): string[] {
        const mentions: string[] = [];
        const patterns = [
            /featured\s+in\s+\w+/gi,
            /as\s+seen\s+on\s+\w+/gi,
        ];

        for (const pattern of patterns) {
            let match;
            while ((match = pattern.exec(text)) !== null) {
                mentions.push(match[0].trim());
            }
        }

        return mentions;
    }

    /**
     * Parses HTML content to extract business information.
     * Note: This is a lightweight implementation without cheerio dependency.
     * For production, consider adding cheerio for more robust parsing.
     */
    private parseHtml(html: string, sourceUrl: string): WebsiteAnalysis {
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch ? this.cleanText(titleMatch[1]) : '';

        const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const h1Text = h1Match ? this.cleanText(h1Match[1]) : '';

        const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
            || html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
        const metaDescription = metaDescMatch ? this.cleanText(metaDescMatch[1]) : '';

        const ogSiteNameMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i);
        const ogSiteName = ogSiteNameMatch ? this.cleanText(ogSiteNameMatch[1]) : '';

        const heroText = h1Text || title;
        const bodyTextRaw = this.extractBodyText(html);
        const bodyTextLower = bodyTextRaw.toLowerCase();

        const keywords = this.extractKeywords(bodyTextLower);
        const detectedBusinessName = this.detectBusinessName(ogSiteName, title, heroText);
        const detectedLocation = this.detectLocation(bodyTextLower);
        const logoUrl = this.detectLogo(html, sourceUrl);
        const address = this.detectAddress(bodyTextRaw);
        const openingHours = this.detectOpeningHours(bodyTextRaw);

        return {
            heroText,
            metaDescription,
            keywords,
            detectedBusinessName,
            detectedLocation,
            address,
            openingHours,
            logoUrl,
            sourceUrl,
        };
    }

    /**
     * Extracts readable text from HTML body.
     */
    private extractBodyText(html: string): string {
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        text = text.replace(/<[^>]+>/g, ' ');
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
    private detectBusinessName(ogSiteName: string, title: string, heroText: string): string | undefined {
        if (ogSiteName) {
            return ogSiteName;
        }

        if (title) {
            const parts = title.split(/[|\-–—]/);
            if (parts.length > 0) {
                return parts[0].trim();
            }
        }

        if (heroText && heroText.length < 50) {
            return heroText;
        }

        return undefined;
    }

    /**
     * Detects location from text content.
     */
    private detectLocation(text: string): string | undefined {
        const berlinDistricts = [
            'kreuzberg', 'neukölln', 'mitte', 'prenzlauer berg', 'friedrichshain',
            'charlottenburg', 'schöneberg', 'wedding', 'tempelhof', 'steglitz',
        ];

        for (const district of berlinDistricts) {
            if (text.includes(district)) {
                return district.charAt(0).toUpperCase() + district.slice(1);
            }
        }

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

    /**
     * Extracts images from HTML with quality filtering.
     * Filters out icons, logos, and low-resolution images.
     */
    extractImages(html: string, sourceUrl: string): ScrapedMedia[] {
        const images: ScrapedMedia[] = [];
        const baseUrl = new URL(sourceUrl);

        // Patterns to exclude (social icons, logos, tracking pixels)
        const excludePatterns = [
            /icon/i,
            /logo/i,
            /favicon/i,
            /social/i,
            /facebook|twitter|instagram|linkedin|youtube/i,
            /sprite/i,
            /pixel/i,
            /tracking/i,
            /badge/i,
            /button/i,
            /arrow/i,
            /1x1/i,
        ];

        // Match img tags with src attribute
        const imgPattern = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let match;

        while ((match = imgPattern.exec(html)) !== null) {
            const fullTag = match[0];
            let src = match[1];

            // Skip data URIs that are too small (likely icons)
            if (src.startsWith('data:') && src.length < 1000) {
                continue;
            }

            // Convert relative URLs to absolute
            if (!src.startsWith('http') && !src.startsWith('data:')) {
                try {
                    src = new URL(src, baseUrl.origin).href;
                } catch {
                    continue;
                }
            }

            // Check exclude patterns
            const shouldExclude = excludePatterns.some(pattern => pattern.test(src));
            if (shouldExclude) {
                continue;
            }

            // Extract width/height if available
            const widthMatch = fullTag.match(/width=["']?(\d+)/i);
            const heightMatch = fullTag.match(/height=["']?(\d+)/i);
            const altMatch = fullTag.match(/alt=["']([^"']+)["']/i);

            const width = widthMatch ? parseInt(widthMatch[1], 10) : 0;
            const height = heightMatch ? parseInt(heightMatch[1], 10) : 0;

            // Skip if dimensions are known and too small (min 800x600)
            if (width > 0 && height > 0 && (width < 800 || height < 600)) {
                continue;
            }

            // Detect if this is a hero image (in header, first large image, or has hero-related class)
            const isHero = /hero|banner|main|featured|header/i.test(fullTag);

            images.push({
                url: src,
                width: width || 1920, // Default to HD if unknown
                height: height || 1080,
                altText: altMatch ? this.cleanText(altMatch[1]) : undefined,
                sourcePage: sourceUrl,
                isHero,
            });
        }

        // Also extract og:image if present (usually high quality)
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i);
        if (ogImageMatch) {
            const ogImageUrl = ogImageMatch[1];
            if (!images.some(img => img.url === ogImageUrl)) {
                images.unshift({
                    url: ogImageUrl,
                    width: 1200, // OG images are typically 1200x630
                    height: 630,
                    altText: 'Open Graph Image',
                    sourcePage: sourceUrl,
                    isHero: true,
                });
            }
        }

        // Sort: hero images first, then by size (larger first)
        images.sort((a, b) => {
            if (a.isHero && !b.isHero) return -1;
            if (!a.isHero && b.isHero) return 1;
            return (b.width * b.height) - (a.width * a.height);
        });

        // Limit to top 10 images
        return images.slice(0, 10);
    }

    /**
     * Detects logo URL from HTML.
     */
    private detectLogo(html: string, sourceUrl: string): string | undefined {
        const logoPatterns = [
            /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*logo[^"']*["']/i,
            /<img[^>]+class=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i,
            /<img[^>]+src=["']([^"']+)["'][^>]*id=["'][^"']*logo[^"']*["']/i,
            /<link[^>]+rel=["']icon["'][^>]*href=["']([^"']+)["']/i,
            /<link[^>]+rel=["']shortcut icon["'][^>]*href=["']([^"']+)["']/i,
        ];

        for (const pattern of logoPatterns) {
            const match = html.match(pattern);
            if (match) {
                let src = match[1];
                try {
                    return new URL(src, sourceUrl).href;
                } catch {
                    // continue
                }
            }
        }
        return undefined;
    }

    /**
     * Detects address from text content.
     */
    private detectAddress(text: string): string | undefined {
        // Look for pattern: <Street> <Number>, <Zip> <City>
        // Regex for detecting German-style address snippet
        // Example: "Friedrichstr. 123, 10117 Berlin"
        const addressPattern = /([A-ZÄÖÜ][a-zäöüß\s.-]+\s\d+[a-z]?,\s*\d{5}\s*[A-ZÄÖÜ][a-zäöüß]+)/;
        const match = text.match(addressPattern);
        if (match) {
            return match[1];
        }

        // Fallback: Look for "Address:" label
        const labelMatch = text.match(/(?:address|anschrift|standort)[:\s]+([^.]+)/i);
        if (labelMatch) {
            return labelMatch[1].substring(0, 100).trim();
        }

        return undefined;
    }

    /**
     * Detects opening hours.
     */
    private detectOpeningHours(text: string): string | undefined {
        // Look for "Opening Hours" or "Öffnungszeiten" block
        const startMatch = text.match(/(?:opening hours|öffnungszeiten)[:\s]*/i);
        if (startMatch) {
            const index = startMatch.index! + startMatch[0].length;
            // Grab next 150 chars as it might contain multiple days
            return text.substring(index, index + 150).split(/[.!]/)[0].trim();
        }
        return undefined;
    }
}
