
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient';
import { WhisperTranscriptionClient } from '../src/infrastructure/transcription/WhisperTranscriptionClient';
import { GptService } from '../src/infrastructure/llm/GptService';
import { loadConfig } from '../src/config';
import * as dotenv from 'dotenv';

dotenv.config();

async function backfillMetadata() {
    console.log('🚀 Starting Metadata Backfill Job...');

    const config = loadConfig();
    const storage = new MediaStorageClient(
        config.cloudinaryCloudName,
        config.cloudinaryApiKey,
        config.cloudinaryApiSecret
    );

    const whisper = new WhisperTranscriptionClient(config.llmApiKey); // Using OpenAI API key for Whisper

    // Use OpenRouter if configured, otherwise fallback to OpenAI
    const gpt = new GptService(
        config.openRouterApiKey || config.llmApiKey,
        config.openRouterModel || 'gpt-4o',
        config.openRouterBaseUrl || 'https://api.openai.com/v1'
    );

    const folder = 'instagram-reels/final-videos';
    console.log(`📂 Listing videos in ${folder}...`);

    const resources = await storage.listResourcesInFolder(folder, 'video', 50);
    console.log(`found ${resources.length} videos.`);

    for (const res of resources) {
        // Skip if already tagged (unless we want to force re-tag)
        if (res.tags.length > 0 && res.tags.includes('backfilled')) {
            console.log(`⏩ Skipping ${res.publicId} (already backfilled)`);
            continue;
        }

        console.log(`\n🔍 Processing: ${res.publicId}`);
        const isPromo = res.publicId.includes('promo_');
        const track = isPromo ? 'COMMERCIAL' : 'CREATIVE';
        console.log(`🛤️ Track: ${track}`);

        try {
            // 1. Transcribe
            console.log('🎙️ Transcribing audio...');
            const transcript = await whisper.transcribe(res.url);
            console.log(`📝 Transcript snippet: ${transcript.substring(0, 100)}...`);

            // 2. Analyze based on Track
            console.log(`🧠 Analyzing for ${track} intelligence...`);

            let systemPrompt = '';
            if (isPromo) {
                systemPrompt = `
                    You are a conversion-focused marketing analyst. 
                    This is a COMMERCIAL PROMO REEL for a business. 
                    Analyze the transcript for:
                    1. 5-8 Marketing/Business tags (e.g. restaurant, gym, branding, offer, local-business).
                    2. The primary Business Category.
                    3. The type of CTA (Call to Action) used.
                    4. A professional marketing summary.
                    
                    Return ONLY a JSON object:
                    {
                        "tags": ["marketing_tag", "category", ...],
                        "cta_type": "visit_site" | "book_now" | "call" | "info",
                        "category": "business_category",
                        "summary": "marketing_summary"
                    }
                `;
            } else {
                systemPrompt = `
                    You are a multi-disciplinary researcher (sociology, tech, evo-psych). 
                    This is a PERSONAL CREATIVE video covering complex topics.
                    Analyze for:
                    1. 10-15 deep, overlapping tags mapping the complex topics.
                    2. Core "Topics" pillars.
                    3. A "Complexity Score" (1-10).
                    
                    Return ONLY a JSON object:
                    {
                        "tags": ["topic1", "topic2", ...],
                        "topics": ["theme1", "theme2"],
                        "complexity": 9,
                        "summary": "intellectual_summary"
                    }
                `;
            }

            const analysisStr = await gpt.chatCompletion(
                `Transcript: ${transcript}`,
                systemPrompt,
                { jsonMode: true }
            );

            const analysis = gpt.parseJSON<any>(analysisStr);

            // 3. Construct intelligent metadata based on profile
            let newTags: string[] = [];
            let context: Record<string, any> = {
                ...res.context,
                backfilled_at: new Date().toISOString(),
                content_type: isPromo ? 'commercial_promo' : 'creative_deepdive'
            };

            if (isPromo) {
                newTags = [...new Set([...res.tags, ...analysis.tags, 'commercial', 'backfilled'])];
                context.auto_category = analysis.category;
                context.cta_type = analysis.cta_type;
                context.marketing_summary = analysis.summary;
                console.log(`✅ Analysis complete: ${analysis.category} (CTA: ${analysis.cta_type})`);
            } else {
                newTags = [...new Set([...res.tags, ...analysis.tags, ...analysis.topics, 'creative', 'backfilled'])];
                context.transcript_summary = analysis.summary;
                context.topics = analysis.topics.join(', ');
                context.complexity = analysis.complexity;
                console.log(`✅ Analysis complete: ${analysis.topics.join(' + ')} (Complexity: ${analysis.complexity})`);
            }

            await storage.updateMetadata(res.publicId, {
                tags: newTags,
                context,
                resourceType: 'video'
            });

            console.log(`✨ Successfully updated ${res.publicId} via ${track} track`);

        } catch (error: any) {
            console.error(`❌ Failed to process ${res.publicId}:`, error.message);
        }
    }

    console.log('\n🏁 Backfill job completed!');
}

backfillMetadata().catch(err => {
    console.error('Fatal error during backfill:', err);
    process.exit(1);
});
