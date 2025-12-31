/**
 * Heuristic Classifier Accuracy Test
 * 
 * Tests the accuracy of our TypeScript heuristics on 20 diverse websites.
 * NO PAID API CALLS - only local scraping and classification.
 * 
 * Usage: npx ts-node scripts/test_classifier_accuracy.ts
 */

import dotenv from 'dotenv';
dotenv.config();

import { EnhancedWebsiteScraper } from '../src/infrastructure/scraper/EnhancedWebsiteScraper';
import { PageNormalizer } from '../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../src/domain/services/SmartSiteClassifier';
import { SiteType, PrimaryIntent } from '../src/domain/entities/Intelligence';

// Force heuristics mode (no Python)
process.env.USE_PYTHON_CLASSIFIER = 'false';

interface TestCase {
    url: string;
    expectedType: SiteType;
    expectedIntent?: PrimaryIntent;
    description: string;
}

// 20 Diverse Test Cases with Ground Truth
const TEST_CASES: TestCase[] = [
    // PORTFOLIO (5)
    { url: 'https://didiberman.com', expectedType: SiteType.PORTFOLIO, description: 'AI Engineer Portfolio' },
    { url: 'https://brittanychiang.com', expectedType: SiteType.PORTFOLIO, description: 'Software Engineer Portfolio' },
    { url: 'https://www.joshwcomeau.com', expectedType: SiteType.PORTFOLIO, description: 'Developer Blog/Portfolio' },
    { url: 'https://www.robinwieruch.de', expectedType: SiteType.PORTFOLIO, description: 'React Developer Portfolio' },
    { url: 'https://cassidoo.co', expectedType: SiteType.PORTFOLIO, description: 'Developer Advocate Portfolio' },

    // SAAS_LANDING (5)
    { url: 'https://linear.app', expectedType: SiteType.SAAS_LANDING, description: 'Project Management SaaS' },
    { url: 'https://notion.so', expectedType: SiteType.SAAS_LANDING, description: 'Productivity SaaS' },
    { url: 'https://vercel.com', expectedType: SiteType.SAAS_LANDING, description: 'Deployment Platform' },
    { url: 'https://stripe.com', expectedType: SiteType.SAAS_LANDING, description: 'Payment API SaaS' },
    { url: 'https://supabase.com', expectedType: SiteType.SAAS_LANDING, description: 'Database SaaS' },

    // ECOMMERCE (4)
    { url: 'https://www.allbirds.com', expectedType: SiteType.ECOMMERCE, description: 'Shoe Store' },
    { url: 'https://www.glossier.com', expectedType: SiteType.ECOMMERCE, description: 'Beauty Products' },
    { url: 'https://www.warbyparker.com', expectedType: SiteType.ECOMMERCE, description: 'Eyewear Store' },
    { url: 'https://www.everlane.com', expectedType: SiteType.ECOMMERCE, description: 'Clothing Store' },

    // LOCAL_SERVICE (4)
    { url: 'https://www.drsmile.de', expectedType: SiteType.LOCAL_SERVICE, description: 'Dental Service Germany' },
    { url: 'https://www.mcfit.com', expectedType: SiteType.LOCAL_SERVICE, description: 'Gym Chain' },
    { url: 'https://www.flixbus.de', expectedType: SiteType.LOCAL_SERVICE, description: 'Bus Service' },
    { url: 'https://www.lieferando.de', expectedType: SiteType.LOCAL_SERVICE, description: 'Food Delivery' },

    // OTHER/BLOG (2)
    { url: 'https://www.smashingmagazine.com', expectedType: SiteType.BLOG, description: 'Web Dev Blog' },
    { url: 'https://css-tricks.com', expectedType: SiteType.BLOG, description: 'CSS Blog' },
];

interface TestResult {
    url: string;
    description: string;
    expectedType: string;
    actualType: string;
    confidence: number;
    correct: boolean;
    error?: string;
}

async function runAccuracyTest() {
    console.log('='.repeat(80));
    console.log('🧪 HEURISTIC CLASSIFIER ACCURACY TEST');
    console.log('='.repeat(80));
    console.log(`Total test cases: ${TEST_CASES.length}`);
    console.log('Mode: TypeScript Heuristics Only (no Python)');
    console.log('');

    const scraper = new EnhancedWebsiteScraper();
    const normalizer = new PageNormalizer();
    const classifier = new SmartSiteClassifier();

    const results: TestResult[] = [];
    let correct = 0;
    let failed = 0;

    for (let i = 0; i < TEST_CASES.length; i++) {
        const testCase = TEST_CASES[i];
        console.log(`\n[${i + 1}/${TEST_CASES.length}] Testing: ${testCase.url}`);
        console.log(`  Expected: ${testCase.expectedType} (${testCase.description})`);

        try {
            // Scrape (no paid APIs)
            const analysis = await scraper.scrapeWebsite(testCase.url);

            // Normalize
            const normalized = normalizer.normalize(analysis);

            // Classify (heuristics only)
            const classification = await classifier.classify(normalized);

            const isCorrect = classification.type === testCase.expectedType;
            if (isCorrect) correct++;

            console.log(`  Actual: ${classification.type} (confidence: ${(classification.confidence * 100).toFixed(0)}%)`);
            console.log(`  Result: ${isCorrect ? '✅ CORRECT' : '❌ WRONG'}`);

            results.push({
                url: testCase.url,
                description: testCase.description,
                expectedType: testCase.expectedType,
                actualType: classification.type,
                confidence: classification.confidence,
                correct: isCorrect
            });

        } catch (error: any) {
            console.log(`  ❌ ERROR: ${error.message}`);
            failed++;
            results.push({
                url: testCase.url,
                description: testCase.description,
                expectedType: testCase.expectedType,
                actualType: 'ERROR',
                confidence: 0,
                correct: false,
                error: error.message
            });
        }

        // Small delay to be polite to servers
        await new Promise(r => setTimeout(r, 1000));
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('📊 RESULTS SUMMARY');
    console.log('='.repeat(80));

    const accuracy = (correct / (TEST_CASES.length - failed)) * 100;
    console.log(`\nAccuracy: ${correct}/${TEST_CASES.length - failed} = ${accuracy.toFixed(1)}%`);
    console.log(`Errors: ${failed}`);

    // Detailed breakdown
    console.log('\n📋 DETAILED RESULTS:');
    console.log('-'.repeat(100));
    console.log('| URL'.padEnd(40) + '| Expected'.padEnd(18) + '| Actual'.padEnd(18) + '| Conf'.padEnd(8) + '| Result |');
    console.log('-'.repeat(100));

    for (const r of results) {
        const urlShort = r.url.replace('https://', '').replace('www.', '').substring(0, 35);
        const resultEmoji = r.error ? '⚠️' : (r.correct ? '✅' : '❌');
        console.log(
            `| ${urlShort.padEnd(38)}` +
            `| ${r.expectedType.padEnd(16)}` +
            `| ${r.actualType.padEnd(16)}` +
            `| ${(r.confidence * 100).toFixed(0).padStart(3)}%`.padEnd(8) +
            `| ${resultEmoji}     |`
        );
    }
    console.log('-'.repeat(100));

    // Category breakdown
    console.log('\n📈 ACCURACY BY CATEGORY:');
    const categories = [...new Set(TEST_CASES.map(t => t.expectedType))];
    for (const cat of categories) {
        const catResults = results.filter(r => r.expectedType === cat && !r.error);
        const catCorrect = catResults.filter(r => r.correct).length;
        const catTotal = catResults.length;
        const catAccuracy = catTotal > 0 ? (catCorrect / catTotal) * 100 : 0;
        console.log(`  ${cat}: ${catCorrect}/${catTotal} (${catAccuracy.toFixed(0)}%)`);
    }

    // Close browser
    await scraper.close();

    console.log('\n✅ Test complete!');
    process.exit(0);
}

runAccuracyTest().catch(console.error);
