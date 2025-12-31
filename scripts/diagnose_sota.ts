/**
 * SOTA Diagnostic Script: Inspect LLM Prompt for didiberman.com
 * 
 * This script shows EXACTLY what the LLM receives after SOTA processing.
 */

import dotenv from 'dotenv';
dotenv.config();

import { EnhancedWebsiteScraper } from '../src/infrastructure/scraper/EnhancedWebsiteScraper';
import { PageNormalizer } from '../src/domain/services/PageNormalizer';
import { SmartSiteClassifier } from '../src/domain/services/SmartSiteClassifier';
import { BlueprintFactory } from '../src/domain/services/BlueprintFactory';
import { buildBlueprintPrompt } from '../src/infrastructure/llm/BlueprintPrompt';

async function diagnoseSOTA() {
    const url = 'https://didiberman.com';

    console.log('='.repeat(80));
    console.log('🔬 SOTA DIAGNOSTIC: Inspecting LLM Prompt for', url);
    console.log('='.repeat(80));

    // STEP 1: Scrape
    console.log('\n📡 STEP 1: Scraping website...');
    const scraper = new EnhancedWebsiteScraper();
    const rawAnalysis = await scraper.scrapeWebsite(url);

    console.log('  ✅ Hero Text:', rawAnalysis.heroText?.substring(0, 100) || 'N/A');
    console.log('  ✅ Meta Description:', rawAnalysis.metaDescription?.substring(0, 100) || 'N/A');
    console.log('  ✅ Site Type:', rawAnalysis.siteType || 'N/A');
    console.log('  ✅ CTA:', rawAnalysis.cta || 'N/A');

    // STEP 2: Normalize
    console.log('\n📐 STEP 2: Normalizing page structure...');
    const normalizer = new PageNormalizer();
    const normalizedPage = normalizer.normalize(rawAnalysis);

    console.log('  ✅ Hero Headline:', normalizedPage.hero.headline);
    console.log('  ✅ Hero Subhead:', normalizedPage.hero.subhead);
    console.log('  ✅ CTA Text:', normalizedPage.cta.text);
    console.log('  ✅ CTA Type:', normalizedPage.cta.type);
    console.log('  ✅ Features Count:', normalizedPage.features.length);
    console.log('  ✅ Testimonials Count:', normalizedPage.socialProof.testimonials.length);
    console.log('  ✅ Contact Email:', normalizedPage.contact.email || 'N/A');

    // STEP 3: Classify
    console.log('\n🏷️  STEP 3: Classifying site type...');
    const classifier = new SmartSiteClassifier();
    const classification = await classifier.classify(normalizedPage);

    console.log('  ✅ Site Type:', classification.type);
    console.log('  ✅ Primary Intent:', classification.intent);
    console.log('  ✅ Confidence:', (classification.confidence * 100).toFixed(1) + '%');
    console.log('  ✅ Reasoning:', classification.reasoning.join('; '));

    // STEP 4: Build Blueprint
    console.log('\n📋 STEP 4: Building video blueprint...');
    const factory = new BlueprintFactory();
    const blueprint = factory.create(normalizedPage, classification);

    console.log('  ✅ Total Duration:', blueprint.totalDuration, 'seconds');
    console.log('  ✅ Beat Count:', blueprint.beats.length);

    console.log('\n  📌 BEATS BREAKDOWN:');
    for (const beat of blueprint.beats) {
        console.log(`     [${beat.kind}] ${beat.duration}s | Style: ${beat.style}`);
        console.log(`        Source: ${beat.contentSource}`);
        console.log(`        Value: "${beat.contentValue || '(empty)'}"`);
        console.log(`        Instruction: ${beat.scriptInstruction}`);
    }

    // STEP 5: Build LLM Prompt
    console.log('\n📝 STEP 5: Building LLM Prompt...');
    const llmPrompt = buildBlueprintPrompt(blueprint, 'en');

    console.log('\n' + '='.repeat(80));
    console.log('🤖 EXACT LLM PROMPT (What GPT Receives):');
    console.log('='.repeat(80));
    console.log(llmPrompt);
    console.log('='.repeat(80));

    // VALIDATION SUMMARY
    console.log('\n📊 VALIDATION SUMMARY:');
    const hasContent = blueprint.beats.some(b => b.contentValue && b.contentValue.length > 0);
    const hasStyles = blueprint.beats.every(b => b.style);
    const hasInstructions = blueprint.beats.every(b => b.scriptInstruction);

    console.log('  ✅ Content Values Populated:', hasContent ? 'YES ✅' : 'NO ❌ (CRITICAL!)');
    console.log('  ✅ Visual Styles Assigned:', hasStyles ? 'YES ✅' : 'NO ❌');
    console.log('  ✅ Script Instructions Present:', hasInstructions ? 'YES ✅' : 'NO ❌');

    if (!hasContent) {
        console.log('\n⚠️  WARNING: Content values are empty! The LLM will hallucinate.');
    }
}

diagnoseSOTA().catch(console.error);
