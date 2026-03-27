
import { getConfig } from '../src/config';
import { createDependencies } from '../src/presentation/app';
import { ProductDemoInput } from '../src/lib/product-demo/domain/entities/ProductDemo';

async function main() {
    const config = getConfig();
    const { productDemoSlice } = createDependencies(config);

    if (!productDemoSlice) {
        console.error('❌ ProductDemoSlice not initialized. Check ENABLE_PRODUCT_DEMO_SLICE in .env');
        process.exit(1);
    }

    const productName = process.argv[2] || 'AgentOps Suite';
    const productUrl = process.argv[3] || 'https://agent-suite-website-production.up.railway.app';
    const githubUrl = process.argv[4] || 'https://github.com/yogami/agent-suite-website';

    console.log(`🎬 Generating demo for: ${productName}`);
    console.log(`🔗 URL: ${productUrl}`);
    console.log(`💻 GitHub: ${githubUrl}`);

    const input: ProductDemoInput = {
        productUrl,
        githubUrl,
        audienceType: 'investor',
        consent: true,
        force: true
    };

    const jobId = `demo_manual_${Date.now()}`;

    try {
        const job = await productDemoSlice.orchestrator.processJob(jobId, input);

        if (job.status === 'completed') {
            const result = job.result;
            if (result && 'videoUrl' in result) {
                console.log('\n✅ Demo generation complete!');
                console.log(`📹 Video URL: ${result.videoUrl}`);
                console.log(`📝 Caption: ${result.caption}`);
            } else if (result && 'eligible' in result) {
                console.log(`\n⚠️ Product not eligible: ${result.reason || result['error']}`);
            }
        } else {
            console.error(`\n❌ Job failed: ${job.error}`);
        }
    } catch (error) {
        console.error('\n💥 Unexpected error:', error);
    }
}

main().catch(console.error);
