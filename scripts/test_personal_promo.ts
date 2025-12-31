/**
 * Quick test script to verify personal promo script generation
 * Run: npx ts-node scripts/test_personal_promo.ts
 */

import { GptLlmClient } from '../src/infrastructure/llm/GptLlmClient';
import { WebsiteScraperClient } from '../src/infrastructure/scraper/WebsiteScraperClient';
import { getConfig } from '../src/config';

async function testPersonalPromo() {
    const config = getConfig();

    console.log('🧪 Testing Personal Promo Script Generation\n');

    // Initialize clients
    const scraper = new WebsiteScraperClient();
    const llmClient = new GptLlmClient(config.llmApiKey, config.llmModel);

    try {
        // Scrape didiberman.com
        console.log('📡 Scraping http://didiberman.com...');
        const analysis = await scraper.scrapeWebsite('http://didiberman.com', { includeSubpages: false });

        console.log(`\n✅ Site scraped successfully!`);
        console.log(`   Site Type: ${analysis.siteType}`);
        console.log(`   Hero Text: ${analysis.heroText}`);

        if (analysis.personalInfo) {
            console.log(`   Personal Info:`);
            console.log(`     - Name: ${analysis.personalInfo.fullName}`);
            console.log(`     - Title: ${analysis.personalInfo.title}`);
            console.log(`     - Skills: ${analysis.personalInfo.skills.join(', ')}`);
            console.log(`     - Headshot: ${analysis.personalInfo.headshotUrl || 'Not found'}`);
        }

        // Generate personal promo script
        if (analysis.siteType === 'personal' && analysis.personalInfo) {
            console.log('\n🎬 Generating personal promo script...');
            const script = await llmClient.generatePersonalPromoScript!(
                analysis,
                analysis.personalInfo.fullName,
                'en'
            );

            console.log(`\n✅ Script generated!`);
            console.log(`   Core Message: "${script.coreMessage}"`);
            console.log(`   Scenes:`);
            script.scenes.forEach((scene, i) => {
                console.log(`     ${i + 1}. [${scene.role}] "${scene.narration}"`);
            });
        } else {
            console.log('\n⚠️  Not detected as personal site');
        }

    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    }
}

testPersonalPromo().catch(console.error);
