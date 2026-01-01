/**
 * Scraping Port - Outbound interface for website content extraction.
 * 
 * This port abstracts the website scraping capability, allowing the slice
 * to work with any scraping implementation (Puppeteer, Cheerio, external API).
 */

import { WebsiteAnalysis } from '../domain/entities/WebsitePromo';

export interface ScrapingOptions {
    /** URL to scrape */
    url: string;
    /** Whether to scrape additional pages (/about, /pricing) */
    deepScrape?: boolean;
    /** Timeout in milliseconds */
    timeoutMs?: number;
}

export interface IScrapingPort {
    /**
     * Scrapes a website and returns structured analysis.
     */
    scrape(options: ScrapingOptions): Promise<WebsiteAnalysis>;
}
