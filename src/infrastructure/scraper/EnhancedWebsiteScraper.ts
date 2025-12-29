import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { IWebsiteScraperClient, ScrapeOptions } from '../../domain/ports/IWebsiteScraperClient';
import { WebsiteAnalysis, ScrapedMedia } from '../../domain/entities/WebsitePromo';
import { WebsiteScraperClient } from './WebsiteScraperClient';

// Helper types for DOM elements since lib: dom might not be included
declare const document: any;
type HTMLImageElement = any;
type HTMLLinkElement = any;

/**
 * Enhanced website scraper with hybrid approach:
 * 1. Schema.org/JSON-LD (fastest, most reliable)
 * 2. HTTP + Cheerio (fast, limited)
 * 3. Playwright (slow, comprehensive for JS-heavy sites)
 */
export class EnhancedWebsiteScraper implements IWebsiteScraperClient {
    private httpScraper: WebsiteScraperClient;
    private browser: Browser | null = null;

    constructor() {
        this.httpScraper = new WebsiteScraperClient();
    }

    async scrapeWebsite(url: string, options?: ScrapeOptions): Promise<WebsiteAnalysis> {
        console.log(`[EnhancedScraper] Starting hybrid scrape for ${url}`);

        // 1. Try HTTP scraper first (fast path)
        try {
            const httpAnalysis = await this.httpScraper.scrapeWebsite(url, options);

            // If we have comprehensive info (Address/Hours), we're done.
            // Just phone/email isn't enough for the video overlay.
            const hasLocation = !!(httpAnalysis.address || httpAnalysis.openingHours);
            if (this.hasContactInfo(httpAnalysis) && hasLocation) {
                console.log('[EnhancedScraper] HTTP scraper found comprehensive info, done');
                return httpAnalysis;
            }

            console.log('[EnhancedScraper] HTTP scraper missed contact info, trying Playwright...');

            // 2. Fall back to Playwright for comprehensive scraping
            const playwrightAnalysis = await this.playwrightScrape(url, httpAnalysis);
            return playwrightAnalysis;

        } catch (error) {
            console.error('[EnhancedScraper] HTTP scraper failed:', error);

            // 3. If HTTP fails completely, try Playwright directly
            return await this.playwrightScrape(url);
        }
    }

    /**
     * Check if analysis has comprehensive contact information.
     * We need more than just one field to successfully create a promo.
     */
    private isContactInfoComprehensive(analysis: WebsiteAnalysis): boolean {
        // Must have at least one valid contact method (Phone OR Email)
        const hasContact = !!(analysis.phone || analysis.email);

        // AND must have location/timing info (Address OR Hours)
        // This forces Playwright to run for restaurants/shops that usually have this in modals
        const hasLocationOrHours = !!(analysis.address || analysis.openingHours);

        return hasContact && hasLocationOrHours;
    }

    /**
     * Check if analysis has any contact information
     */
    private hasContactInfo(analysis: WebsiteAnalysis): boolean {
        return !!(analysis.phone || analysis.email || analysis.address || analysis.openingHours);
    }

    /**
     * Comprehensive Playwright-based scraping for JS-heavy sites
     */
    private async playwrightScrape(url: string, existingAnalysis?: WebsiteAnalysis): Promise<WebsiteAnalysis> {
        let page: Page | null = null;
        let context: BrowserContext | null = null;

        try {
            // Launch browser if not already running
            if (!this.browser) {
                this.browser = await chromium.launch({
                    headless: true,
                    args: ['--no-sandbox', '--disable-setuid-sandbox']
                });
            }

            context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                viewport: { width: 1920, height: 1080 },
                locale: 'de-DE'
            });

            page = await context.newPage();

            // Set timeout
            page.setDefaultTimeout(15000);

            console.log(`[Playwright] Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

            // Dismiss cookie consent if present
            await this.dismissCookieConsent(page);

            // Wait a bit for any animations
            await page.waitForTimeout(1000);

            // Try to extract structured data first
            const structuredData = await this.extractStructuredData(page);

            // Extract basic analysis
            let analysis: WebsiteAnalysis = existingAnalysis || {
                heroText: '',
                metaDescription: '',
                keywords: [],
                sourceUrl: url,
            };

            // Merge structured data
            if (structuredData) {
                analysis = { ...analysis, ...structuredData };
            }

            // Extract from visible page
            if (!this.isContactInfoComprehensive(analysis)) {
                analysis = await this.extractFromPage(page, analysis);
            }

            // Try clicking contact/info buttons to reveal modals
            // Force this if we are missing hours or address, even if we have one of them
            if (!analysis.openingHours || !analysis.address) {
                await this.tryModalInteractions(page, analysis);
            }

            // Try expanding accordions/tabs
            if (!this.isContactInfoComprehensive(analysis)) {
                await this.expandAccordions(page);
                analysis = await this.extractFromPage(page, analysis);
            }

            // Extract images if not already done
            if (!analysis.scrapedMedia || analysis.scrapedMedia.length === 0) {
                analysis.scrapedMedia = await this.extractImages(page, url);
            }

            // Extract logo if not found
            if (!analysis.logoUrl) {
                analysis.logoUrl = await this.extractLogo(page, url);
            }

            console.log('[Playwright] Scrape complete:', {
                hasPhone: !!analysis.phone,
                hasEmail: !!analysis.email,
                hasAddress: !!analysis.address,
                hasHours: !!analysis.openingHours
            });

            return analysis;

        } catch (error) {
            console.error('[Playwright] Scraping failed:', error);
            // Return existing analysis or empty
            return existingAnalysis || {
                heroText: '',
                metaDescription: '',
                keywords: [],
                sourceUrl: url
            };
        } finally {
            if (page) await page.close();
            if (context) await context.close();
        }
    }

    /**
     * Dismiss cookie consent banners
     */
    private async dismissCookieConsent(page: Page): Promise<void> {
        const consentSelectors = [
            'button:has-text("Accept")',
            'button:has-text("Akzeptieren")',
            'button:has-text("Alle akzeptieren")',
            'button:has-text("Accept all")',
            'button:has-text("OK")',
            'button:has-text("Agree")',
            'button:has-text("Zustimmen")',
            '[class*="cookie"] button',
            '[class*="consent"] button',
            '[id*="cookie"] button',
            '[id*="consent"] button',
            '.cc-btn.cc-dismiss',
            '#onetrust-accept-btn-handler',
        ];

        for (const selector of consentSelectors) {
            try {
                const button = await page.$(selector);
                if (button && await button.isVisible()) {
                    console.log('[Playwright] Dismissing cookie consent...');
                    await button.click();
                    await page.waitForTimeout(500);
                    return;
                }
            } catch {
                // Ignore - try next selector
            }
        }
    }

    /**
     * Extract Schema.org/JSON-LD structured data
     */
    private async extractStructuredData(page: Page): Promise<Partial<WebsiteAnalysis> | null> {
        try {
            const jsonLdData = await page.evaluate(() => {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                const data: any[] = [];

                scripts.forEach((script: any) => {
                    try {
                        const parsed = JSON.parse(script.textContent || '');
                        data.push(parsed);
                    } catch {
                        // Invalid JSON, skip
                    }
                });

                return data;
            });

            if (jsonLdData.length === 0) return null;

            const analysis: Partial<WebsiteAnalysis> = {};

            for (const item of jsonLdData) {
                // Handle arrays and single objects
                const items = Array.isArray(item) ? item : [item];

                for (const obj of items) {
                    // LocalBusiness, Restaurant, Organization, etc.
                    if (obj['@type'] && ['LocalBusiness', 'Restaurant', 'Organization', 'Store', 'FoodEstablishment', 'Cafe'].includes(obj['@type'])) {
                        analysis.detectedBusinessName = obj.name;
                        analysis.phone = obj.telephone;
                        analysis.email = obj.email;

                        if (obj.address) {
                            if (typeof obj.address === 'string') {
                                analysis.address = obj.address;
                            } else if (obj.address.streetAddress) {
                                analysis.address = [
                                    obj.address.streetAddress,
                                    obj.address.postalCode,
                                    obj.address.addressLocality
                                ].filter(Boolean).join(', ');
                            }
                        }

                        if (obj.openingHours) {
                            analysis.openingHours = Array.isArray(obj.openingHours)
                                ? obj.openingHours.join('; ')
                                : obj.openingHours;
                        }

                        if (obj.logo) {
                            analysis.logoUrl = typeof obj.logo === 'string' ? obj.logo : obj.logo.url;
                        }

                        if (obj.image) {
                            const imgUrl = typeof obj.image === 'string' ? obj.image : obj.image.url;
                            if (imgUrl) {
                                analysis.scrapedMedia = [{
                                    url: imgUrl,
                                    width: 1920,
                                    height: 1080,
                                    sourcePage: '',
                                    isHero: true
                                }];
                            }
                        }
                    }
                }
            }

            if (Object.keys(analysis).length > 0) {
                console.log('[Playwright] Extracted structured data:', analysis);
            }

            return analysis;

        } catch (error) {
            console.error('[Playwright] Failed to extract structured data:', error);
            return null;
        }
    }

    /**
     * Extract contact info from visible page content
     */
    private async extractFromPage(page: Page, analysis: WebsiteAnalysis): Promise<WebsiteAnalysis> {
        const extracted = await page.evaluate(() => {
            const text = document.body.innerText;

            // Phone extraction
            const phonePatterns = [
                /(?:\+49|0049|0)\s?[\d\s\-\/]{8,15}/g,
                /\+?\d{1,3}[-.\s]?\(?\d{2,5}\)?[-.\s]?\d{3,10}[-.\s]?\d{0,5}/g
            ];

            let phone = '';
            for (const pattern of phonePatterns) {
                const matches = text.match(pattern);
                if (matches && matches[0]) {
                    phone = matches[0].trim();
                    break;
                }
            }

            // Also check tel: links
            const telLink = document.querySelector('a[href^="tel:"]');
            if (telLink) {
                phone = telLink.getAttribute('href')?.replace('tel:', '') || phone;
            }

            // Email extraction
            const emailPattern = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
            const emailMatches = text.match(emailPattern);
            let email = emailMatches?.[0] || '';

            // Also check mailto: links
            const mailtoLink = document.querySelector('a[href^="mailto:"]');
            if (mailtoLink) {
                email = mailtoLink.getAttribute('href')?.replace('mailto:', '') || email;
            }

            // Address extraction - German format
            const addressPattern = /([A-ZÄÖÜ][a-zäöüß.\s-]+(?:str(?:aße)?|weg|platz|allee)[.\s]+\d+[a-z]?,?\s*\d{5}\s*[A-ZÄÖÜ][a-zäöüß\s-]+)/i;
            const addressMatch = text.match(addressPattern);
            const address = addressMatch?.[1] || '';

            // Opening hours - German keywords
            let openingHours = '';
            const hoursLabels = ['öffnungszeiten', 'opening hours', 'geöffnet', 'zeiten'];
            for (const label of hoursLabels) {
                const idx = text.toLowerCase().indexOf(label);
                if (idx !== -1) {
                    const snippet = text.substring(idx, idx + 200);
                    const lines = snippet.split('\n').slice(0, 5);
                    openingHours = lines.join(' ').substring(0, 150);
                    break;
                }
            }

            // Hero text
            const h1 = document.querySelector('h1');
            const heroText = h1?.textContent?.trim() || '';

            // Business name
            const title = document.title;
            const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') || '';
            const businessName = ogSiteName || title.split(/[|\-–—]/)[0].trim();

            return { phone, email, address, openingHours, heroText, businessName };
        });

        // Merge with existing analysis
        if (extracted.phone && !analysis.phone) analysis.phone = extracted.phone;
        if (extracted.email && !analysis.email) analysis.email = extracted.email;
        if (extracted.address && !analysis.address) analysis.address = extracted.address;
        if (extracted.openingHours && !analysis.openingHours) analysis.openingHours = extracted.openingHours;
        if (extracted.heroText && !analysis.heroText) analysis.heroText = extracted.heroText;
        if (extracted.businessName && !analysis.detectedBusinessName) analysis.detectedBusinessName = extracted.businessName;

        return analysis;
    }

    /**
     * Try clicking common contact/info buttons to reveal modals
     */
    private async tryModalInteractions(page: Page, analysis: WebsiteAnalysis): Promise<void> {
        const buttonSelectors = [
            // German
            'button:has-text("Info")',
            'button:has-text("Kontakt")',
            'button:has-text("Öffnungszeiten")',
            'button:has-text("Mehr")',
            'a:has-text("Info")',
            'a:has-text("Kontakt")',
            'a:has-text("Impressum")',
            // English
            'button:has-text("Contact")',
            'button:has-text("Hours")',
            'button:has-text("Location")',
            'a:has-text("Contact")',
            'a:has-text("About")',
            // Common classes
            '[class*="info-btn"]',
            '[class*="contact-btn"]',
            '#info-button',
            '#contact-button',
        ];

        for (const selector of buttonSelectors) {
            try {
                const button = await page.$(selector);
                if (button && await button.isVisible()) {
                    console.log(`[Playwright] Clicking ${selector}...`);
                    await button.click();
                    await page.waitForTimeout(1500); // Wait for modal/content

                    // Re-extract after modal opens
                    const newAnalysis = await this.extractFromPage(page, { ...analysis });

                    // Update if we found new info
                    if (newAnalysis.phone && !analysis.phone) analysis.phone = newAnalysis.phone;
                    if (newAnalysis.email && !analysis.email) analysis.email = newAnalysis.email;
                    if (newAnalysis.address && !analysis.address) analysis.address = newAnalysis.address;
                    if (newAnalysis.openingHours && !analysis.openingHours) analysis.openingHours = newAnalysis.openingHours;

                    // Try to close modal
                    const closeSelector = 'button[aria-label="Close"], button:has-text("×"), .close-button, [class*="close"]';
                    const closeButton = await page.$(closeSelector);
                    if (closeButton) {
                        try {
                            await closeButton.click();
                            await page.waitForTimeout(500);
                        } catch {
                            // Ignore close errors
                        }
                    }

                    // If we found contact info, we're done
                    if (this.hasContactInfo(analysis)) {
                        console.log('[Playwright] Found contact info after clicking button');
                        return;
                    }
                }
            } catch {
                // Ignore errors - button might not be clickable
            }
        }
    }

    /**
     * Expand accordion/tab elements
     */
    private async expandAccordions(page: Page): Promise<void> {
        const accordionSelectors = [
            '[class*="accordion"]',
            '[class*="collapse"]',
            '[class*="expandable"]',
            'details',
            '[data-toggle="collapse"]',
        ];

        for (const selector of accordionSelectors) {
            try {
                const elements = await page.$$(selector);
                for (const el of elements.slice(0, 5)) { // Limit to 5 to avoid infinite loops
                    try {
                        if (await el.isVisible()) {
                            await el.click();
                            await page.waitForTimeout(300);
                        }
                    } catch {
                        // Ignore
                    }
                }
            } catch {
                // Ignore
            }
        }
    }

    /**
     * Extract images from page
     */
    private async extractImages(page: Page, baseUrl: string): Promise<ScrapedMedia[]> {
        return await page.evaluate((base) => {
            const images: any[] = [];
            const imgs = document.querySelectorAll('img');

            const excludePatterns = /icon|logo|favicon|social|sprite|pixel|badge|button|arrow|1x1/i;

            imgs.forEach((img: any) => {
                if (!img.src || excludePatterns.test(img.src)) return;
                if (img.width < 200 || img.height < 200) return;

                try {
                    const url = new URL(img.src, base).href;
                    images.push({
                        url,
                        width: img.naturalWidth || img.width || 1920,
                        height: img.naturalHeight || img.height || 1080,
                        altText: img.alt,
                        sourcePage: base,
                        isHero: /hero|banner|main|featured/i.test(img.className)
                    });
                } catch {
                    // Invalid URL
                }
            });

            // Sort by size (larger first)
            images.sort((a, b) => (b.width * b.height) - (a.width * a.height));
            return images.slice(0, 10);
        }, baseUrl);
    }

    /**
     * Extract logo from page
     */
    private async extractLogo(page: Page, baseUrl: string): Promise<string | undefined> {
        return await page.evaluate((base) => {
            const selectors = [
                'img[alt*="logo" i]',
                'img[class*="logo" i]',
                '.logo img',
                'header img',
                '[class*="brand"] img'
            ];

            for (const selector of selectors) {
                const img = document.querySelector(selector) as HTMLImageElement;
                if (img?.src) {
                    try {
                        return new URL(img.src, base).href;
                    } catch {
                        // Invalid URL
                    }
                }
            }

            // Fallback to favicon
            const favicon = document.querySelector('link[rel*="icon"]') as HTMLLinkElement;
            if (favicon?.href) {
                return favicon.href;
            }

            return undefined;
        }, baseUrl);
    }

    /**
     * Cleanup browser resources
     */
    async close(): Promise<void> {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}
