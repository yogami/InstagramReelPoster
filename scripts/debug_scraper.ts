
import { EnhancedWebsiteScraper } from '../src/infrastructure/scraper/EnhancedWebsiteScraper';
import { WebsiteScraperClient } from '../src/infrastructure/scraper/WebsiteScraperClient';

async function debugScraper() {
    const url = 'https://berlinailabs.de';
    console.log(`🔍 Debugging Scraper for: ${url}`);

    // Try Enhanced first (since that's what production uses)
    const scraper = new EnhancedWebsiteScraper();

    try {
        const result = await scraper.scrapeWebsite(url, { includeSubpages: true });

        console.log('\n--- Extraction Results ---');
        console.log('Address:', result.address);
        console.log('Email:', result.email);
        console.log('Phone:', result.phone);
        console.log('Hero:', result.heroText);
        console.log('Keywords:', result.keywords.slice(0, 10)); // First 10

        console.log('\n--- Dirty Data Check ---');
        if (result.address && result.address.includes('erhoben')) {
            console.error('❌ FAIL: Address contains GDPR boilerplate');
        } else {
            console.log('✅ Address looks clean (basic check)');
        }

        if (!result.phone) {
            console.error('❌ FAIL: Phone number missing');
        }

    } catch (e) {
        console.error('Scrape failed:', e);
    }
}

debugScraper();
