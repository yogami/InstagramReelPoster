
import { loadConfig } from '../src/config';
import { createWebsitePromoSlice } from '../src/lib/website-promo';
import { WebsiteScraperAdapter } from '../src/lib/website-promo/adapters/WebsiteScraperAdapter';
import { ScriptGenerationAdapter } from '../src/lib/website-promo/adapters/ScriptGenerationAdapter';
import { AssetGenerationAdapter } from '../src/lib/website-promo/adapters/AssetGenerationAdapter';
import { RenderingAdapter } from '../src/lib/website-promo/adapters/RenderingAdapter';

// Infrastructure imports
import { GptLlmClient } from '../src/infrastructure/llm/GptLlmClient';
import { CloningTtsClient } from '../src/infrastructure/tts/CloningTtsClient';
import { MultiModelImageClient } from '../src/infrastructure/images/MultiModelImageClient';
import { MusicSelector } from '../src/application/MusicSelector';
import { InMemoryMusicCatalogClient } from '../src/infrastructure/music/InMemoryMusicCatalogClient';
import { WhisperSubtitlesClient } from '../src/infrastructure/subtitles/WhisperSubtitlesClient';
import { TimelineVideoRenderer } from '../src/infrastructure/video/TimelineVideoRenderer';
import { EnhancedWebsiteScraper } from '../src/infrastructure/scraper/EnhancedWebsiteScraper';
import { MediaStorageClient } from '../src/infrastructure/storage/MediaStorageClient';

async function runSampleGeneration() {
    console.log('🚀 Starting Real Video Generation for Phase 2 Validation...');

    const config = loadConfig();

    // 1. Setup real adapters
    const scraper = new EnhancedWebsiteScraper();
    const llmClient = new GptLlmClient(config.llmApiKey, config.llmModel, config.llmBaseUrl);
    const ttsClient = new CloningTtsClient(config.ttsCloningApiKey, config.ttsCloningVoiceId, config.ttsCloningBaseUrl);
    const imageClient = new MultiModelImageClient(config.multiModelImageApiKey, config.multiModelImageModel, config.multiModelImageBaseUrl);
    const musicSelector = new MusicSelector(new InMemoryMusicCatalogClient(config.internalMusicCatalogPath), null, null);

    const cloudinaryClient = new MediaStorageClient(
        config.cloudinaryCloudName,
        config.cloudinaryApiKey,
        config.cloudinaryApiSecret
    );
    const subtitlesClient = new WhisperSubtitlesClient(config.llmApiKey, cloudinaryClient);
    const videoRenderer = new TimelineVideoRenderer(config.timelineApiKey, config.timelineBaseUrl);

    // 2. Create the slice
    const slice = createWebsitePromoSlice({
        scrapingPort: new WebsiteScraperAdapter(scraper),
        scriptPort: new ScriptGenerationAdapter(llmClient),
        assetPort: new AssetGenerationAdapter(
            ttsClient,
            imageClient,
            musicSelector,
            subtitlesClient
        ),
        renderingPort: new RenderingAdapter(videoRenderer),
        onStatusChange: async (status) => console.log(`📡 [STATUS]: ${status.status}`)
    });

    // 3. Trigger job
    const websiteUrl = 'https://www.drsmile.de';
    console.log(`🌐 Scraping ${websiteUrl}...`);

    try {
        const job = await slice.orchestrator.processJob('validation_job_p2', {
            websiteUrl,
            consent: true,
            language: 'de',
            voiceStyle: 'energetic',  // Phase 2
            motionStyle: 'ken_burns',  // Phase 2
            subtitleStyle: 'bold'      // Phase 2
        });

        if (job.status === 'failed') {
            throw new Error(job.error || 'Job failed');
        }

        const result = job.result!;

        console.log('\n✅ VIDEO GENERATION COMPLETE!');
        console.log('--------------------------------------------------');
        console.log(`🎥 Final Video URL: ${result.videoUrl}`);
        console.log(`📝 Caption: ${result.caption.substring(0, 100)}...`);
        console.log(`🧬 Content DNA: Pain=${result.siteDNA.painScore}, Trust=${result.siteDNA.trustSignals.length}, Urgency=${result.siteDNA.urgency}`);
        console.log('--------------------------------------------------');
        console.log('\nCopy the Video URL above into your browser to validate both visual (motion/subs) and auditory (voice/music) enhancements.');
    } catch (error) {
        console.error('❌ Generation Failed:', error);
    }
}

runSampleGeneration().catch(console.error);
