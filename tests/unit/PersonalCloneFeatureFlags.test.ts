import * as fs from 'fs';
import * as path from 'path';

/**
 * Tests for Personal Clone Feature Flags and Infrastructure
 */
describe('Personal Clone Feature Flags', () => {
    const configPath = path.join(__dirname, '../../src/config/index.ts');

    test('Config should include Personal Clone feature flags', () => {
        const content = fs.readFileSync(configPath, 'utf-8');

        // Verify feature flags exist
        expect(content).toContain('usePersonalCloneTTS');
        expect(content).toContain('usePersonalCloneLLM');
        expect(content).toContain('personalCloneTrainingMode');
    });

    test('Feature flags should default to false (non-breaking)', () => {
        const content = fs.readFileSync(configPath, 'utf-8');

        // Verify defaults are false
        expect(content).toContain("getEnvVarBoolean('USE_PERSONAL_CLONE_TTS', false)");
        expect(content).toContain("getEnvVarBoolean('USE_PERSONAL_CLONE_LLM', false)");
        expect(content).toContain("getEnvVarBoolean('PERSONAL_CLONE_TRAINING_MODE', false)");
    });

    test('Config should include Personal Clone server URLs', () => {
        const content = fs.readFileSync(configPath, 'utf-8');

        // Verify server config exists
        expect(content).toContain('xttsServerUrl');
        expect(content).toContain('localLLMUrl');
        expect(content).toContain('trainingDataPath');
    });
});

describe('TrainingDataCollector', () => {
    const collectorPath = path.join(__dirname,
        '../../src/infrastructure/training/TrainingDataCollector.ts');

    test('TrainingDataCollector should exist', () => {
        expect(fs.existsSync(collectorPath)).toBe(true);
    });

    test('TrainingDataCollector should have voice sample collection', () => {
        const content = fs.readFileSync(collectorPath, 'utf-8');
        expect(content).toContain('collectVoiceSample');
        expect(content).toContain('VoiceSample');
    });

    test('TrainingDataCollector should have text sample collection', () => {
        const content = fs.readFileSync(collectorPath, 'utf-8');
        expect(content).toContain('collectTextSample');
        expect(content).toContain('TextSample');
    });

    test('TrainingDataCollector should support export for XTTS', () => {
        const content = fs.readFileSync(collectorPath, 'utf-8');
        expect(content).toContain('exportForXTTS');
    });

    test('TrainingDataCollector should support export for LLM', () => {
        const content = fs.readFileSync(collectorPath, 'utf-8');
        expect(content).toContain('exportForLLM');
    });
});
