import { loadConfig } from '../src/config';
import { GptLlmClient } from '../src/infrastructure/llm/GptLlmClient';
import { WebsiteScraperClient } from '../src/infrastructure/scraper/WebsiteScraperClient';
import { SemanticAnalyzer } from '../src/infrastructure/analysis/SemanticAnalyzer';
import { InMemoryMusicCatalogClient } from '../src/infrastructure/music/InMemoryMusicCatalogClient';
import { MusicSelector } from '../src/application/MusicSelector';
import { getPromptTemplate, getMusicStyle } from '../src/infrastructure/llm/CategoryPrompts';
import path from 'path';

async function verifyPromoPlan(url: string) {
    console.log(`\n🔍 Dry-run Verification for: ${url}\n`);

    const config = loadConfig();

    // 1. Scraping
    console.log('--- Step 1: Scraping & Semantic Analysis ---');
    const scraper = new WebsiteScraperClient();
    const analysis = await scraper.scrapeWebsite(url, { includeSubpages: true });

    const semanticAnalyzer = new SemanticAnalyzer();
    const siteDNA = semanticAnalyzer.analyzeSiteDNA(analysis);
    analysis.siteDNA = siteDNA;

    const bizName = analysis.detectedBusinessName || 'Local Business';
    console.log(`✅ Business Name: ${bizName}`);
    console.log(`✅ Category Scored: ${analysis.detectedLocation || 'Berlin'}`);
    console.log(`🧬 Site DNA:`);
    console.log(`   - Pain Score: ${siteDNA.painScore}/10`);
    console.log(`   - Trust Signals: ${siteDNA.trustSignals.length}`);
    console.log(`   - Urgency: ${siteDNA.urgency || 'None detected'}`);

    // 2. Category Detection
    console.log('\n--- Step 2: Category Detection ---');
    const llmClient = new GptLlmClient(config.openaiApiKey, config.openaiModel);
    const category = await llmClient.detectBusinessCategory(analysis);
    console.log(`✅ Detected Category: ${category}`);

    // 3. Script Generation
    console.log('\n--- Step 3: Script Generation ---');
    const template = getPromptTemplate(category);
    const promoScript = await llmClient.generatePromoScript(
        analysis,
        category,
        template,
        bizName,
        'en' // Default to English for testing
    );

    console.log(`✅ Core Message: "${promoScript.coreMessage}"`);
    console.log(`✅ Music Style Requested: ${promoScript.musicStyle}`);

    // 4. Duration Estimation (Safety Check)
    console.log('\n--- Step 4: Duration & Word Budget Check ---');
    const speakingRate = config.speakingRateWps || 1.66;
    let totalWords = 0;

    promoScript.scenes.forEach((scene, i) => {
        const wordCount = scene.narration.split(/\s+/).filter(w => w.length > 0).length;
        totalWords += wordCount;
        const estimatedSeconds = wordCount / speakingRate;
        const isOvershooting = estimatedSeconds > scene.duration;

        console.log(`   Scene ${i + 1} (${scene.role}):`);
        console.log(`     - Words: ${wordCount}`);
        console.log(`     - Budget: ${scene.duration}s`);
        console.log(`     - Estimated: ${estimatedSeconds.toFixed(1)}s ${isOvershooting ? '❌ (OVERSHOOT)' : '✅'}`);
    });

    const totalEstimatedDuration = totalWords / speakingRate;
    const targetDuration = promoScript.scenes.reduce((sum, s) => sum + s.duration, 0);
    console.log(`\n   TOTAL: ${totalEstimatedDuration.toFixed(1)}s (Target: ${targetDuration}s) ${totalEstimatedDuration > targetDuration ? '❌ RED' : '✅ GREEN'}`);

    // 5. Music Selection
    console.log('\n--- Step 5: Music Selection (Local Catalog) ---');
    const musicCatalog = new InMemoryMusicCatalogClient(path.join(__dirname, '../assets/music_catalog.json'));
    const musicSelector = new MusicSelector(musicCatalog);
    const musicStyle = getMusicStyle(category);
    const musicResult = await musicSelector.selectMusic([musicStyle, 'advertisement'], targetDuration, promoScript.musicStyle);

    if (musicResult) {
        console.log(`✅ Selected Track: "${musicResult.track.title}"`);
        console.log(`   Source: ${musicResult.source}`);
        console.log(`   Tags: ${musicResult.track.tags.join(', ')}`);
        console.log(`   Audio URL: ${musicResult.track.audioUrl}`);
    } else {
        console.log('❌ No matching music found in catalog.');
    }

    console.log('\n--- Verification Complete ---');
}

const url = process.argv[2];
if (!url) {
    console.error('Usage: ts-node scripts/verify_promo_plan.ts <website_url>');
    process.exit(1);
}

verifyPromoPlan(url).catch(err => {
    console.error('Final Verification Failed:', err);
    process.exit(1);
});
