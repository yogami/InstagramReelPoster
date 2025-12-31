/**
 * DEBUG SCRIPT: didiberman.com deep dive
 * Run: npx ts-node scripts/debug_didi.ts
 */

import { WebsiteScraperClient } from '../src/infrastructure/scraper/WebsiteScraperClient';

async function debugDidi() {
    const scraper = new WebsiteScraperClient();
    console.log('🕵️‍♂️ Scraping didiberman.com...');

    // Scrape
    const analysis = await scraper.scrapeWebsite('http://didiberman.com', { includeSubpages: false });

    console.log('\n--- 📸 IMAGES FOUND ---');
    if (analysis.scrapedMedia) {
        analysis.scrapedMedia.forEach((m, i) => {
            console.log(`[${i}] URL: ${m.url}`);
            console.log(`    Alt: "${m.altText || ''}"`);
            console.log(`    Hero: ${m.isHero}`);
            console.log(`    Dimensions: ${m.width}x${m.height}`);
            console.log(`    SVG: ${m.url.toLowerCase().endsWith('.svg')}`);
        });
    } else {
        console.log('❌ No media extracted!');
    }

    console.log('\n--- 👤 PERSONAL INFO ---');
    if (analysis.personalInfo) {
        console.log('Extracted Headshot:', analysis.personalInfo.headshotUrl);
        console.log('Name:', analysis.personalInfo.fullName);
    } else {
        console.log('❌ No personal info extracted');
    }

    console.log('\n--- 📞 CONTACT INFO ---');
    console.log('Values present in analysis object:');
    console.log('Phone:', analysis.phone);
    console.log('Address:', analysis.address);
    console.log('Opening Hours:', analysis.openingHours);

    console.log('\n--- 🔍 SOCIALS ---');
    console.log(analysis.socialLinks);

    // Simulate Headshot Logic
    console.log('\n--- 🧪 SIMULATING LOGIC ---');
    if (analysis.scrapedMedia) {
        const firstName = analysis.personalInfo?.fullName.split(' ')[0].toLowerCase() || 'didi';

        const matches = analysis.scrapedMedia.filter(m => {
            const isSvg = m.url.toLowerCase().endsWith('.svg');
            if (isSvg) return false;

            const urlLower = m.url.toLowerCase();
            const altLower = (m.altText || '').toLowerCase();

            return (
                urlLower.includes('profile') ||
                urlLower.includes('headshot') ||
                urlLower.includes(firstName) ||
                altLower.includes('profile') ||
                altLower.includes('headshot') ||
                altLower.includes(firstName)
            );
        });

        console.log(`Matched ${matches.length} headshot candidates:`);
        matches.forEach(m => console.log(`- ${m.url}`));
    }
}

debugDidi().catch(console.error);
