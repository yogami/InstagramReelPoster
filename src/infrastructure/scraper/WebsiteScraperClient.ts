import axios from 'axios';
import * as cheerio from 'cheerio';
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

        const pages = [
            { path: '/about', type: 'about' },
            { path: '/pricing', type: 'pricing' },
            { path: '/testimonials', type: 'testimonials' },
            { path: '/contact', type: 'contact' },
            { path: '/impressum', type: 'contact' },
            { path: '/contact-us', type: 'contact' },
        ];

        for (const page of pages) {
            const subpageUrl = `${baseOrigin}${page.path}`;
            const html = await this.scrapeSubpage(subpageUrl);
            if (!html) continue;

            const text = this.extractBodyText(html);

            // 1. Update domain-specific content if not already set robustly
            if (page.type === 'about' && !analysis.aboutContent) {
                analysis.aboutContent = text;
            }
            if (page.type === 'pricing' && !analysis.pricingContent) {
                analysis.pricingContent = this.extractPricingContent(html);
            }
            if (page.type === 'testimonials' && !analysis.testimonialsContent) {
                analysis.testimonialsContent = this.extractTestimonials(html);
            }

            // 2. Fill missing contact info from subpages (high priority for promo)
            if (!analysis.email) analysis.email = this.detectEmail(text, html);
            if (!analysis.phone) analysis.phone = this.detectPhone(text);
            if (!analysis.address) analysis.address = this.detectAddress(text);
            if (!analysis.openingHours) analysis.openingHours = this.detectOpeningHours(text);
            if (!analysis.logoUrl) {
                analysis.logoUrl = this.detectLogo(html, subpageUrl);
            }
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
        const $ = cheerio.load(html);

        // EXTRACTION: Perform contact info extraction BEFORE removing elements
        // This ensures footer and nav data is preserved for address/phone/email
        const bodyTextRaw = this.cleanText($('body').text());
        const bodyTextLower = bodyTextRaw.toLowerCase();

        const address = this.detectAddress(bodyTextRaw);
        const openingHours = this.detectOpeningHours(bodyTextRaw);
        const phone = this.detectPhone(bodyTextRaw);
        const email = this.detectEmail(bodyTextRaw, html);

        // CLEANING: Now remove junk/interstitial/popup elements for theme/keyword extraction
        $('script, style, noscript, iframe, nav, footer, aside, button, input, textarea, select').remove();
        $('[class*="modal"], [id*="modal"], [class*="popup"], [id*="popup"], [class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [class*="overlay"], [id*="overlay"], [class*="banner"], [id*="banner"], .privacy-policy, .terms-service').remove();

        const title = this.cleanText($('title').text() || '');
        const h1Text = this.cleanText($('h1').first().text() || '');

        // Extract meta description/OG description
        const metaDescription = this.cleanText(
            $('meta[name="description"]').attr('content') ||
            $('meta[property="og:description"]').attr('content') ||
            ''
        );

        const ogSiteName = this.cleanText($('meta[property="og:site_name"]').attr('content') || '');
        const heroText = h1Text || title;

        // Text extraction strategy: Focus on core content areas after cleaning
        const contentSelector = $('main').length ? 'main' : ($('article').length ? 'article' : 'body');
        const cleanBodyTextLower = this.cleanText($(contentSelector).text()).toLowerCase();

        // Detect if this is likely an intermediate/bot-check page
        if (this.isIntermediatePage(cleanBodyTextLower, title.toLowerCase())) {
            console.log(`[Scraper] Warning: Potential intermediate/redirect page detected for ${sourceUrl}`);
        }

        const keywords = this.extractKeywords(cleanBodyTextLower);
        const detectedBusinessName = this.detectBusinessName(ogSiteName, title, heroText);
        const detectedLocation = this.detectLocation(cleanBodyTextLower);
        const logoUrl = this.detectLogo(html, sourceUrl);

        return {
            heroText,
            metaDescription,
            keywords,
            detectedBusinessName,
            detectedLocation,
            address,
            openingHours,
            phone,
            email,
            logoUrl,
            sourceUrl,
        };
    }

    /**
     * Detects if the page is an intermediate bot-check or redirect page.
     */
    private isIntermediatePage(text: string, title: string): boolean {
        const indicators = [
            'checking your browser',
            'please wait',
            'redirecting',
            'cloudflare',
            'enable cookies',
            'verify you are human',
            'access denied'
        ];

        return indicators.some(ind => text.includes(ind) || title.includes(ind));
    }

    /**
     * Extracts readable text from HTML body using Cheerio and filters out popups.
     */
    private extractBodyText(html: string): string {
        const $ = cheerio.load(html);

        // Remove known junk/interstitial/popup elements from the DOM
        $('script, style, noscript, iframe, nav, footer, aside, button, input, textarea, select').remove();
        $('[class*="modal"], [id*="modal"], [class*="popup"], [id*="popup"], [class*="cookie"], [id*="cookie"], [class*="consent"], [id*="consent"], [class*="overlay"], [id*="overlay"], [class*="banner"], [id*="banner"], .privacy-policy, .terms-service').remove();

        return this.cleanText($('body').text());
    }

    /**
     * Cleans and normalizes text by removing extra whitespace and decoding HTML entities.
     */
    private cleanText(text: string): string {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&nbsp;/g, ' ');
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
        // Filter out generic titles like "Home", "Index", "Welcome"
        const genericNames = ['home', 'index', 'welcome', 'berlin', 'default', 'website'];
        const isGeneric = (name: string) => genericNames.includes(name.toLowerCase().trim());

        if (ogSiteName && !isGeneric(ogSiteName)) {
            return ogSiteName;
        }

        if (title) {
            // Priority: Take the first part of title usually before a separator
            const parts = title.split(/[|\-–—]/);
            const candidate = parts[0].trim();
            if (candidate && !isGeneric(candidate) && candidate.length > 2) {
                return candidate;
            }
        }

        if (heroText && heroText.length < 40 && !isGeneric(heroText)) {
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
            let ogImageUrl = ogImageMatch[1];

            // Convert relative OG URLs to absolute
            if (ogImageUrl && !ogImageUrl.startsWith('http') && !ogImageUrl.startsWith('data:')) {
                try {
                    ogImageUrl = new URL(ogImageUrl, sourceUrl).href;
                } catch {
                    // skip
                }
            }

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
        const $ = cheerio.load(html);
        const baseUrl = new URL(sourceUrl);

        // Priority 1: High-confidence image selectors
        const selectors = [
            'picture.logo img',
            'img[alt*="logo" i]',
            'img[class*="logo" i]',
            '.logo img',
            '.brand img',
            'header img',
            'img[src*="logo" i]',
            '[class*="logo"] img',
            '[id*="logo"] img'
        ];

        for (const selector of selectors) {
            const src = $(selector).attr('src');
            if (src) {
                // Ignore small icons
                if (src.toLowerCase().includes('logo') || !src.toLowerCase().endsWith('.ico')) {
                    try {
                        return new URL(src, sourceUrl).href;
                    } catch {
                        // skip
                    }
                }
            }
        }

        // Priority 2: OG Image
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (ogImage && ogImage.toLowerCase().includes('logo')) {
            try {
                return new URL(ogImage, sourceUrl).href;
            } catch {
                // skip
            }
        }

        // Priority 3: Apple Touch Icon
        const appleIcon = $('link[rel="apple-touch-icon"]').attr('href');
        if (appleIcon) {
            try {
                return new URL(appleIcon, sourceUrl).href;
            } catch {
                // skip
            }
        }

        // Fallback: Standard favicon
        const favicon = $('link[rel*="icon"]').attr('href');
        if (favicon) {
            try {
                return new URL(favicon, sourceUrl).href;
            } catch {
                // skip
            }
        }

        return undefined;
    }

    /**
     * Detects address from text content.
     */
    private detectAddress(text: string): string | undefined {
        // Blacklist for GDPR/Privacy policy noise that often gets picked up
        const blacklist = ['erhoben', 'datenschutz', 'cookie', 'freiwillig', 'required', 'pflichtfeld', 'newsletter', 'email', 'e-mail'];

        const isValidCandidate = (candidate: string) => {
            const lower = candidate.toLowerCase();
            if (candidate.length < 10) return false;
            if (candidate.length > 120) return false; // Too long to be just an address
            if (blacklist.some(term => lower.includes(term))) return false;
            return true;
        };

        // 1. Strict Pattern: <Street> <Number>, <Zip> <City> (German Format)
        // Must contain 5-digit zip code
        const addressPattern = /([A-ZÄÖÜ][a-zäöüß\s.-]+\s\d+[a-z]?,?\s*\d{5}\s*[A-ZÄÖÜ][a-zäöüß\s-]+)/;
        const match = text.match(addressPattern);
        if (match) {
            if (isValidCandidate(match[1])) return match[1];
        }

        // 2. Label Fallback
        const labels = [
            /(?:^|\s)anschrift[:\s]+/i,
            /(?:^|\s)standort[:\s]+/i,
            /(?:^|\s)adresse[:\s]+/i,
            /(?:^|\s)visit us[:\s]+/i
        ];

        for (const label of labels) {
            const labelMatch = text.match(label);
            if (labelMatch) {
                const start = labelMatch.index! + labelMatch[0].length;
                const snippet = text.substring(start, start + 100).trim();
                // Take content up to first newline, dot or specific delimiters
                const clean = snippet.split(/[\n.!|]/)[0].trim();

                if (isValidCandidate(clean)) return clean;
            }
        }

        return undefined;
    }

    /**
     * Detects opening hours.
     */
    private detectOpeningHours(text: string): string | undefined {
        const labels = [/opening hours[:\s]*/i, /öffnungszeiten[:\s]*/i, /business hours[:\s]*/i, /zeiten[:\s]*/i];
        for (const label of labels) {
            const labelMatch = text.match(label);
            if (labelMatch) {
                const start = labelMatch.index! + labelMatch[0].length;
                const snippet = text.substring(start, start + 150).trim();
                const clean = snippet.split(/[.!]/)[0].trim();
                if (clean.length > 3) return clean;
            }
        }
        return undefined;
    }

    /**
     * Detects phone number from text.
     */
    private detectPhone(text: string): string | undefined {
        // 1. Strict International Mobile Format (Targeting the +49 176... report)
        // Matches: +49 176 1234567, +49-176-1234567
        // Allow spaces, dashes, dots between digits
        const strictMobile = /(?:\+49|0049)[-. \s]?[1-9]\d{1,4}[-. \s]?\d+(?:[-. \s]?\d+)+/;
        const mobileMatch = text.match(strictMobile);
        if (mobileMatch) {
            const cleaned = mobileMatch[0].replace(/[^\d+]/g, '');
            if (cleaned.length >= 10) return mobileMatch[0].trim();
        }

        // 2. Label Search
        const labels = [/phone[:\s]*/i, /tel[:\s]*/i, /telefon[:\s]*/i, /mobil[:\s]*/i, /call[:\s]*/i, /kontakt[:\s]*/i];
        for (const label of labels) {
            const labelMatch = text.match(label);
            if (labelMatch) {
                const start = labelMatch.index! + labelMatch[0].length;
                const snippet = text.substring(start, start + 50).trim();
                // Look for phone-like sequence
                const phoneMatch = snippet.match(/(?:\+?\d{1,3}[-. \s]?)?\(?\d{1,5}\)?(?:[-. \s]?\d{1,5}){1,6}/);
                if (phoneMatch) {
                    const cleaned = phoneMatch[0].replace(/[^\d+]/g, '');
                    if (cleaned.length >= 8) return phoneMatch[0].trim();
                }
            }
        }

        return undefined;
    }

    private detectEmail(text: string, html: string): string | undefined {
        const emails: string[] = [];

        // 1. Collect from mailto links
        const mailtoMatches = html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
        for (const match of mailtoMatches) {
            emails.push(match[1].toLowerCase());
        }

        // 2. Collect from raw text
        // Use a strict regex that avoids capturing surrounding words
        const emailPattern = /(?:\s|^)([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(?:\s|$|[.,!?;:])/g;
        const textMatches = text.matchAll(emailPattern);
        for (const match of textMatches) {
            emails.push(match[1].toLowerCase());
        }

        if (emails.length === 0) return undefined;

        // Dedup
        const uniqueEmails = Array.from(new Set(emails));

        // 3. Priority Scoring
        const priorities = ['sales', 'info', 'contact', 'hello', 'office'];
        for (const p of priorities) {
            const found = uniqueEmails.find(e => e.includes(p));
            if (found) return found;
        }

        return uniqueEmails[0];
    }
}
