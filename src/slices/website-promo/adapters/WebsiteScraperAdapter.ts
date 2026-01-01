/**
 * Website Scraper Adapter
 * 
 * Bridges the slice's IScrapingPort to the existing EnhancedWebsiteScraper.
 */

import { IScrapingPort, ScrapingOptions } from '../ports/IScrapingPort';
import { WebsiteAnalysis } from '../domain/entities/WebsitePromo';
import { IWebsiteScraperClient } from '../../../domain/ports/IWebsiteScraperClient';

export class WebsiteScraperAdapter implements IScrapingPort {
    constructor(private readonly scraperClient: IWebsiteScraperClient) { }

    async scrape(options: ScrapingOptions): Promise<WebsiteAnalysis> {
        const result = await this.scraperClient.scrapeWebsite(options.url);

        // Map legacy result to slice domain model
        return {
            heroText: result.heroText || '',
            metaDescription: result.metaDescription || '',
            aboutContent: result.aboutContent,
            detectedBusinessName: result.detectedBusinessName,
            detectedLocation: result.detectedLocation,
            address: result.address,
            openingHours: result.openingHours,
            phone: result.phone,
            email: result.email,
            logoUrl: result.logoUrl,
            keywords: result.keywords || [],
            sourceUrl: options.url,
            scrapedMedia: result.scrapedMedia,
            rawText: result.rawText,
            cta: result.cta,
            contact: result.contact,
            siteType: result.siteType,
            personalInfo: result.personalInfo,
            socialLinks: result.socialLinks
        };
    }
}
