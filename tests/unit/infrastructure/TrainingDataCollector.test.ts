import * as fs from 'fs';
import * as path from 'path';
import { TrainingDataCollector } from '../../../src/infrastructure/training/TrainingDataCollector';
import { getConfig } from '../../../src/config';

jest.mock('fs');
jest.mock('../../../src/config');

describe('TrainingDataCollector', () => {
    const mockDataPath = './test_data';
    const mockConfig = {
        featureFlags: {
            personalCloneTrainingMode: true
        },
        personalClone: {
            trainingDataPath: mockDataPath
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        (getConfig as jest.Mock).mockReturnValue(mockConfig);
        (fs.existsSync as jest.Mock).mockReturnValue(true);
    });

    describe('constructor', () => {
        it('should create directories if they do not exist', () => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
            new TrainingDataCollector(mockDataPath);
            expect(fs.mkdirSync).toHaveBeenCalledTimes(3);
        });
    });

    describe('collectVoiceSample', () => {
        it('should throw if training mode is disabled', async () => {
            (getConfig as jest.Mock).mockReturnValue({
                featureFlags: { personalCloneTrainingMode: false }
            });
            const collector = new TrainingDataCollector(mockDataPath);
            await expect(collector.collectVoiceSample('url', 'text', 10))
                .rejects.toThrow('Training mode is not enabled');
        });

        it('should write voice sample to disk', async () => {
            const collector = new TrainingDataCollector(mockDataPath);
            const sample = await collector.collectVoiceSample('http://audio.url', 'Hello transcript', 15);

            expect(sample.audioUrl).toBe('http://audio.url');
            expect(sample.transcript).toBe('Hello transcript');
            expect(fs.writeFileSync).toHaveBeenCalled();
            const calledPath = (fs.writeFileSync as jest.Mock).mock.calls[0][0];
            expect(calledPath).toContain('voice');
        });
    });

    describe('collectTextSample', () => {
        it('should write text sample to disk', async () => {
            const collector = new TrainingDataCollector(mockDataPath);
            const sample = await collector.collectTextSample('Sample commentary', 'commentary');

            expect(sample.content).toBe('Sample commentary');
            expect(fs.writeFileSync).toHaveBeenCalled();
            const calledPath = (fs.writeFileSync as jest.Mock).mock.calls[0][0];
            expect(calledPath).toContain('text');
        });
    });

    describe('getStats', () => {
        it('should calculate stats from disk', async () => {
            (fs.readdirSync as jest.Mock).mockImplementation((dir: string) => {
                if (dir.includes('voice')) return ['v1.json', 'v2.json'];
                if (dir.includes('text')) return ['t1.json'];
                return [];
            });

            (fs.readFileSync as jest.Mock).mockImplementation((filePath: string) => {
                if (filePath.includes('v')) return JSON.stringify({ durationSeconds: 30 });
                if (filePath.includes('t')) return JSON.stringify({ content: 'one two three' });
                return '';
            });

            const collector = new TrainingDataCollector(mockDataPath);
            const stats = await collector.getStats();

            expect(stats.voiceSamples).toBe(2);
            expect(stats.voiceTotalMinutes).toBe(1); // (30+30)/60
            expect(stats.textSamples).toBe(1);
            expect(stats.textTotalWords).toBe(3);
        });

        it('should handle corrupt files graciously', async () => {
            (fs.readdirSync as jest.Mock).mockReturnValue(['corrupt.json']);
            (fs.readFileSync as jest.Mock).mockReturnValue('invalid json');

            const collector = new TrainingDataCollector(mockDataPath);
            const stats = await collector.getStats();
            expect(stats.voiceSamples).toBe(1);
            expect(stats.voiceTotalMinutes).toBe(0);
        });
    });

    describe('exportForXTTS', () => {
        it('should create metadata json for XTTS', async () => {
            (fs.readdirSync as jest.Mock).mockReturnValue(['v1.json']);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                audioUrl: 'url1',
                transcript: 'text1'
            }));

            const collector = new TrainingDataCollector(mockDataPath);
            const exportPath = await collector.exportForXTTS();

            expect(exportPath).toContain('xtts_export');
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('metadata.json'),
                expect.stringContaining('url1')
            );
        });
    });

    describe('exportForLLM', () => {
        it('should create jsonl for LLM', async () => {
            (fs.readdirSync as jest.Mock).mockReturnValue(['t1.json']);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                content: 'text1',
                type: 'commentary'
            }));

            const collector = new TrainingDataCollector(mockDataPath);
            const exportPath = await collector.exportForLLM();

            expect(exportPath).toContain('llm_export');
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                expect.stringContaining('training_data.jsonl'),
                expect.stringContaining('text1')
            );
        });
    });
});
