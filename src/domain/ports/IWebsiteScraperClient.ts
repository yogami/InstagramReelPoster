import { WebsiteAnalysis } from '../entities/WebsitePromo';

/**
 * Port for scraping business websites.
 * Extracts content for category detection and promo script generation.
 */
export interface IWebsiteScraperClient {
    /**
     * Scrapes a website for business information.
     * @param url The website URL to scrape
     * @returns Scraped content analysis
     * @throws Error if the website is unreachable or cannot be parsed
     */
    scrapeWebsite(url: string): Promise<WebsiteAnalysis>;
}
