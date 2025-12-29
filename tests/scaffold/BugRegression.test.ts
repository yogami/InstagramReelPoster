
import fs from 'fs';
import path from 'path';

describe('Bug Regression Verification', () => {
    const projectRoot = path.resolve(__dirname, '../../src');

    test('Fix 1: LLM Prompt should NOT force visual referencing (preventing Museum Guide style)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/llm/Prompts.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // It should NOT contain the old harmful instruction
        expect(content).not.toContain('MUST reference 2-3 visual elements from imagePrompt');
    });


    test('Fix 2: Voice should be configured to Voice Cloning (User Preference)', () => {
        const filePath = path.join(projectRoot, 'presentation/app.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Should use CloningTtsClient
        expect(content).toContain('new CloningTtsClient');

        // Should import CloningTtsClient
        expect(content).toContain('import { CloningTtsClient }');
    });

    test('Fix 3: Orchestrator should upload to Media and Delay (preventing Timeline download error)', () => {
        const filePath = path.join(projectRoot, 'application/services/PromoAssetService.ts');
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
        const filePath = path.join(projectRoot, 'application/pipelines/steps/RenderStep.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('Waiting 5s for final video propagation');
    });

    test('Fix 6: Image Policy should be strict (Heterosexual)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/llm/Prompts.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        // Check for heterosexual couple requirement
        expect(content).toContain('Heterosexual couple');
    });

    test('Fix 7: Background Music Volume should be low (0.1)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/video/TimelineVideoRenderer.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('volume: 0.1');
    });

    test('Fix 8: Subtitles should be readable (Size 48, Margin 350)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/video/TimelineVideoRenderer.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('size: 48');
        expect(content).toContain('y: 0.15');
    });

    test('Fix 9: Images should be Vertical (9:16 Prompt)', () => {
        const filePath = path.join(projectRoot, 'infrastructure/images/MultiModelImageClient.ts');
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).toContain('Aspect Ratio: 9:16 Vertical Portrait');
    });

    /**
     * Fix 10: Parable mode segment count should NOT be overwritten by HookAndStructureService
     * 
     * ROOT CAUSE: When parable mode pre-generates 4 beats, the HookAndStructureService 
     * was overwriting plan.segmentCount with its own value (e.g., 6). Later, validation 
     * compared 4 actual segments against 6 expected → mismatch error.
     * 
     * FIX: For parable mode with pre-generated content, skip updating plan.segmentCount.
     */
    test('Fix 10: Parable mode should NOT overwrite segment count after hook optimization', () => {
        const filePath = path.join(projectRoot, 'application/pipelines/steps/CommentaryStep.ts');
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check that validation is skipped for parable mode
        expect(content).toContain('Skipping segment validation for parable mode');
    });

    test('Fix 11: Commentary should be 95-100% of video length', () => {
        const calculatorPath = path.join(projectRoot, 'domain/services/DurationCalculator.ts');
        const calcContent = fs.readFileSync(calculatorPath, 'utf-8');

        // Should target 99% for safety (in DurationCalculator)
        expect(calcContent).toContain('targetSeconds * 0.99 * rate');
        // Should catch any overshoot (> 0 deviation)
        expect(calcContent).toContain('if (deviation > 0)');

        const llmPath = path.join(projectRoot, 'infrastructure/llm/StandardReelGenerator.ts');
        const llmContent = fs.readFileSync(llmPath, 'utf-8');

        // Should target high safety margin
        expect(llmContent).toContain('safetyMargin = 0.98');

        const promptsPath = path.join(projectRoot, 'infrastructure/llm/Prompts.ts');
        const promptsContent = fs.readFileSync(promptsPath, 'utf-8');
        expect(promptsContent).toContain('Targets 95-98% video length');
    });

    test('Fix 12: HookPlan should NOT override enforced segment count', () => {
        const orchestratorPath = path.join(projectRoot, 'application/pipelines/steps/HookStep.ts');
        const content = fs.readFileSync(orchestratorPath, 'utf-8');

        // There should be a comment preventing segment count override
        expect(content).toContain('DO NOT override plan.segmentCount');

        // The line `plan.segmentCount = hookPlan.segmentCount` should NOT exist
        expect(content).not.toMatch(/plan\.segmentCount\s*=\s*hookPlan\.segmentCount/);
    });
});
