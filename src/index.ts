import { createApp } from './presentation/app';
import { loadConfig, validateConfig } from './config';

async function main(): Promise<void> {
    console.log('🎬 Instagram Reel Poster - Starting...');

    // Load and validate configuration
    const config = loadConfig();
    const configErrors = validateConfig(config);

    if (configErrors.length > 0) {
        console.error('❌ Configuration errors:');
        configErrors.forEach((error) => console.error(`  - ${error}`));
        console.error('\nPlease check your .env file and set all required variables.');
        process.exit(1);
    }

    // Create and start the app
    const app = createApp(config);

    app.listen(config.port, () => {
        console.log(`✅ Server running on http://localhost:${config.port}`);
        console.log(`   Environment: ${config.nodeEnv}`);
        console.log('');
        console.log('📡 Endpoints:');
        console.log(`   POST /process-reel    - Start a new reel generation job`);
        console.log(`   GET  /jobs/:jobId     - Check job status and results`);
        console.log(`   GET  /jobs            - List all jobs`);
        console.log(`   GET  /health          - Health check`);
        console.log('');
    });
}

main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
