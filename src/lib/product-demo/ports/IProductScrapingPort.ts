/**
 * Product Scraping Port
 * 
 * Outbound interface for scraping SaaS product pages.
 * Handles content extraction, screenshots, and demo button detection.
 */

import { ProductAnalysis, ScrapedImage, DemoButtonResult } from '../domain/entities/ProductDemo';

export interface ProductScrapingOptions {
    /** URL to scrape */
    url: string;
    /** Whether to capture full-page screenshots */
    captureScreenshots?: boolean;
    /** Whether to extract images from the page */
    extractImages?: boolean;
    /** Additional pages to scrape (e.g., /pricing, /features) */
    additionalPages?: string[];
    /** Timeout in milliseconds */
    timeoutMs?: number;
}

export interface IProductScrapingPort {
    /**
     * Scrapes a product page and returns structured analysis.
     */
    scrapeProduct(options: ProductScrapingOptions): Promise<ProductAnalysis>;

    /**
     * Captures screenshots of the product page.
     * 
     * @param url - URL to screenshot
     * @param pages - Optional additional pages to capture
     * @returns Array of screenshot URLs (stored in cloud)
     */
    captureScreenshots(url: string, pages?: string[]): Promise<string[]>;

    /**
     * Extracts relevant images from the product page.
     * 
     * @param url - URL to extract images from
     * @returns Array of scraped images with context
     */
    extractImages(url: string): Promise<ScrapedImage[]>;

    /**
     * Finds and analyzes demo/trial buttons on the page.
     * 
     * @param url - URL to analyze
     * @returns Demo button result or null if none found
     */
    findDemoButton(url: string): Promise<DemoButtonResult | null>;
}
