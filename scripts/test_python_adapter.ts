
import { PythonClassifierAdapter } from '../src/infrastructure/intelligence/PythonClassifierAdapter';

async function run() {
    const adapter = new PythonClassifierAdapter();
    console.log("Running Python Adapter Test...");

    // Test Case 1: SaaS
    const saasResult = await adapter.classify("The ultimate API for developers. Integrate in minutes. Free tier available.", {
        contacts: { email: "support@api.com" }
    });
    console.log("SaaS Result:", saasResult);

    // Test Case 2: Local Service
    const plumberResult = await adapter.classify("Emergency Plumber Berlin. blocked drains, leaking pipes. Call us 24/7.", {
        contacts: { phone: "+4912345" }
    });
    console.log("Plumber Result:", plumberResult);
}

run().catch(console.error);
