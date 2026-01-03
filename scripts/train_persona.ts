
import { PromoEngineFactory } from '../src/lib/promo-engine/PromoEngineFactory';
import { loadConfig } from '../src/config';

// Load env vars
loadConfig();

async function main() {
    const datasetName = 'my_personal_dataset';
    const folderName = 'instagram-reels'; // Folder in Cloudinary
    const modelName = process.argv[2]; // e.g., "your-username/my-flux-persona"
    const triggerWord = process.argv[3] || 'OHWX';

    if (!modelName) {
        console.error('Usage: npx ts-node scripts/train_persona.ts <replicate-model-destination> [trigger-word]');
        process.exit(1);
    }

    console.log('🚀 Initializing Promo Engine...');

    // 1. Prepare Dataset (mocked in this script or real?)
    // Real flow: Get reels from Cloudinary -> Create Dataset
    // But Replicate needs a ZIP URL.
    // Our PrepareDatasetUseCase currently returns a mock URL in the real implementation? 
    // Wait, let's check PrepareDatasetUseCase.

    // Check: The current PrepareDatasetUseCase implementation in the "real" factory uses CloudinaryReelRepository,
    // BUT the use case itself (PrepareDatasetUseCase.ts) still has hardcoded simulation logic:
    // "Simulating frame extraction" and returning a mock URL or just a list of samples.
    // We need to fix PrepareDatasetUseCase to actually Create a Zip from the reels and upload it?
    // OR, for the first version, we assume the user provides a direct URL to a zip of images.

    // Let's look at ReplicateTrainingAdapter - it takes `config.trainingDataUrl`.

    const trainBox = PromoEngineFactory.createTrainPersonaUseCase();

    console.log(`💪 Starting training for model: ${modelName}`);
    console.log(`   Trigger word: ${triggerWord}`);
    console.log(`   (Note: Ensure you have a valid ZIP of images. For this script, we'll ask for it or use a default if implemented)`);

    // Ideally we would automate the zipping. For now, let's assume valid input.
    // Since we don't have the Zipping logic implemented, I'll allow passing the URL as an arg or env.
    const trainingDataUrl = process.env.TRAINING_DATA_URL || 'https://example.com/path/to/my-images.zip';

    if (trainingDataUrl.includes('example.com')) {
        console.warn("⚠️  WARNING: Using placeholder training data URL. Set TRAINING_DATA_URL env var to your real image zip.");
    }

    try {
        const jobId = await trainBox.execute({
            datasetId: 'manual-run',
            trainingDataUrl: trainingDataUrl,
            modelName: modelName,
            triggerWord: triggerWord
        });

        console.log(`✅ Training started! Job ID: ${jobId}`);
        console.log(`   Monitor at: https://replicate.com/p/${jobId}`);
    } catch (error) {
        console.error('❌ Training failed to start:', error);
    }
}

main();
