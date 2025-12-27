import { WebsiteAnalysis } from '../entities/WebsitePromo';

/**
 * Options for website scraping.
 */
export interface ScrapeOptions {
    /** Scrape additional pages: /about, /pricing, /testimonials */
    includeSubpages?: boolean;
}

/**
 * Port for scraping business websites.
 * Extracts content for category detection and promo script generation.
 */
export interface IWebsiteScraperClient {
    /**
     * Scrapes a website for business information.
     * @param url The website URL to scrape
     * @param options Optional scraping options
     * @returns Scraped content analysis
     * @throws Error if the website is unreachable or cannot be parsed
     */
    scrapeWebsite(url: string, options?: ScrapeOptions): Promise<WebsiteAnalysis>;
}

