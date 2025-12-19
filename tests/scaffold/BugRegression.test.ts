
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
        expect(content).toContain('NEVER describe the visual');
        expect(content).toContain('Gen-Z Simple English');
    });

    test('Fix 2: Voice should be configured to Fish Audio (User Preference)', () => {
        const filePath = path.join(projectRoot, 'presentation/app.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Should use FishAudioTTSClient
        expect(content).toContain('new FishAudioTTSClient');

        // Should confirm ttsClient is assigned to FishAudio
        expect(content).toMatch(/const ttsClient = new FishAudioTTSClient/);
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

    test('Fix 5: Final Video should have propagation delay', () => {
        const filePath = path.join(projectRoot, 'application/ReelOrchestrator.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('Waiting 5s for final video propagation');
    });

    test('Fix 6: Image Policy should be strict (Heterosexual & Race Neutral)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/llm/OpenAILLMClient.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('RACE/ETHNICITY: People must be race-neutral');
        expect(content).toContain('MUST be a Heterosexual couple');
    });

    test('Fix 7: Background Music Volume should be low (0.1)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/video/ShortstackVideoRenderer.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('volume: 0.1');
    });

    test('Fix 8: Subtitles should be readable (Size 48, Margin 350)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/video/ShortstackVideoRenderer.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('size: 48');
        expect(content).toContain('bottom: 350');
    });

    test('Fix 9: Images should be Vertical (9:16 Prompt)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/images/OpenRouterImageClient.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('Aspect Ratio: 9:16 Vertical Portrait');
    });
});
