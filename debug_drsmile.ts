import { WebsiteScraperClient } from './src/infrastructure/scraper/WebsiteScraperClient';
import fs from 'fs';

async function debugDrSmile() {
    const scraper = new WebsiteScraperClient();
    const url = 'https://www.drsmile.de';
    console.log(`Scraping ${url}...`);
    const analysis = await scraper.scrapeWebsite(url);
    console.log('Raw text length:', analysis.rawText?.length);
    fs.writeFileSync('drsmile_raw.txt', analysis.rawText || '');
    console.log('Saved raw text to drsmile_raw.txt');
}

debugDrSmile().catch(console.error);
