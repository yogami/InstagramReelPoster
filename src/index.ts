import { createApp } from './presentation/app';
import { loadConfig, validateConfig } from './config';

async function main(): Promise<void> {
    console.log('🎬 Instagram Reel Poster - Bootstrap Phase 0...');

    try {
        // 1. Load and validate configuration
        console.log('📋 Loading configuration...');
        const config = loadConfig();

        console.log('🔍 Validating configuration...');
        const configErrors = validateConfig(config);

        if (configErrors.length > 0) {
            console.error('❌ Configuration validation failed:');
            configErrors.forEach((error) => console.error(`  - ${error}`));
            process.exit(1);
        }

        // 2. Create and start the app
        console.log('🚀 Initializing application components...');
        const app = createApp(config);

        app.listen(config.port, () => {
            console.log(`✅ Server running on http://localhost:${config.port}`);
            console.log(`   Environment: ${config.environment}`);
            console.log(`   Renderer: ${config.videoRenderer}`);
        });
    } catch (error) {
        console.error('💥 Fatal error during bootstrap:', error);
        process.exit(1);
    }
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
