/**
 * Content DNA Accuracy & Extraction Test (Sub-sample for fast verification)
 */

import dotenv from 'dotenv';
dotenv.config();

import { EnhancedWebsiteScraper } from '../src/infrastructure/scraper/EnhancedWebsiteScraper';
import { ContentDNAAnalyzer } from '../src/lib/website-promo/domain/services/ContentDNAAnalyzer';

const TEST_CASES = [
    { url: 'https://linear.app', description: 'Streamlined PM' },
    { url: 'https://www.drsmile.de', description: 'Dental Service' },
    { url: 'https://www.allbirds.com', description: 'Shoes' },
];

async function runDNATest() {
    const scraper = new EnhancedWebsiteScraper();
    const dnaAnalyzer = new ContentDNAAnalyzer();

    for (const testCase of TEST_CASES) {
        console.log(`\nTesting: ${testCase.url}`);
        const analysis = await scraper.scrapeWebsite(testCase.url);
        const dna = dnaAnalyzer.analyzeDNA(analysis);

        console.log(`  - Pain Score: ${dna.painScore}/10`);
        console.log(`  - Trust Signals: ${dna.trustSignals.length} found`);
        if (dna.trustSignals.length > 0) {
            console.log(`    Signals: ${dna.trustSignals.slice(0, 3).join(', ')}`);
        }
        console.log(`  - Urgency: ${dna.urgency || 'None'}`);
        console.log(`  - Confidence: ${(dna.confidence * 100).toFixed(0)}%`);
    }

    await scraper.close();
    process.exit(0);
}

runDNATest().catch(console.error);
