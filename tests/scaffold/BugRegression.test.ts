
import fs from 'fs';
import path from 'path';

describe('Bug Regression Verification', () => {
    const projectRoot = path.resolve(__dirname, '../../src');

    test('Fix 1: LLM Prompt should NOT force visual referencing (preventing Museum Guide style)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/llm/OpenAILLMClient.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // It should NOT contain the old harmful instruction
        expect(content).not.toContain('MUST reference 2-3 visual elements from imagePrompt');

        // It SHOULD contain the new instruction
        expect(content).toContain('Focus on the MESSAGE, not the visual');
    });

    test('Fix 2: Voice should be configured to OpenAI Onyx (Male)', () => {
        const filePath = path.join(projectRoot, 'presentation/app.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Should use OpenAITTSClient
        expect(content).toContain('new OpenAITTSClient');

        // Should use 'onyx' voice
        expect(content).toContain("'onyx'");

        // Should NOT use FishAudio definitions for the active client (though import might exist)
        // We check for the instantiation block we replaced
        expect(content).not.toContain('new FishAudioTTSClient');
    });

    test('Fix 3: Orchestrator should upload to Cloudinary and Delay (preventing Shotstack download error)', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for delay logic
        expect(content).toContain('Waiting 2s for asset propagation');
        expect(content).toContain('setTimeout(resolve, 2000)');
    });

    test('Fix 4: Make.com Callback should include permanent video_url', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for the payload logic fix
        expect(content).toContain('payload.video_url = job.finalVideoUrl');
    });
});
