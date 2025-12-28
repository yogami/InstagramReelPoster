/**
 * FFmpegVideoRenderer unit tests
 * 
 * Note: Full integration testing of FFmpeg requires a real FFmpeg binary.
 * These tests focus on the constructor and path handling logic.
 * The actual rendering is tested in integration tests.
 */

import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock fluent-ffmpeg BEFORE importing FFmpegVideoRenderer
jest.mock('fluent-ffmpeg', () => {
    return jest.fn().mockReturnValue({
        input: jest.fn().mockReturnThis(),
        inputOptions: jest.fn().mockReturnThis(),
        complexFilter: jest.fn().mockReturnThis(),
        outputOptions: jest.fn().mockReturnThis(),
        save: jest.fn().mockReturnThis(),
        on: jest.fn().mockReturnThis()
    });
});

jest.mock('fs');
jest.mock('os');

import { FFmpegVideoRenderer } from '../../../src/infrastructure/video/FFmpegVideoRenderer';
import { MediaStorageClient } from '../../../src/infrastructure/storage/MediaStorageClient';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;

describe('FFmpegVideoRenderer', () => {
    let mockMediaClient: jest.Mocked<MediaStorageClient>;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock os.tmpdir
        mockedOs.tmpdir.mockReturnValue('/tmp');

        // Mock fs.existsSync and mkdirSync
        mockedFs.existsSync.mockReturnValue(false);
        mockedFs.mkdirSync.mockImplementation(() => undefined as any);

        // Mock Media client
        mockMediaClient = {
            uploadFromUrl: jest.fn().mockResolvedValue({ url: 'https://cloudinary.com/video.mp4' })
        } as any;
    });

    describe('constructor', () => {
        test('should create renderer with cloudinary client', () => {
            const renderer = new FFmpegVideoRenderer(mockMediaClient);
            expect(renderer).toBeInstanceOf(FFmpegVideoRenderer);
        });

        test('should set temp directory path', () => {
            const renderer = new FFmpegVideoRenderer(mockMediaClient);
            expect((renderer as any).tempDir).toBe(path.join('/tmp', 'reel-poster-renders'));
        });

        test('should create temp directory if it does not exist', () => {
            mockedFs.existsSync.mockReturnValue(false);

            new FFmpegVideoRenderer(mockMediaClient);

            expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('reel-poster-renders'),
                { recursive: true }
            );
        });

        test('should not create temp directory if it exists', () => {
            mockedFs.existsSync.mockReturnValue(true);

            new FFmpegVideoRenderer(mockMediaClient);

            expect(mockedFs.mkdirSync).not.toHaveBeenCalled();
        });

        test('should store cloudinary client reference', () => {
            const renderer = new FFmpegVideoRenderer(mockMediaClient);
            expect((renderer as any).cloudinaryClient).toBe(mockMediaClient);
        });
    });

    describe('temp directory handling', () => {
        test('should use os.tmpdir for base path', () => {
            mockedOs.tmpdir.mockReturnValue('/custom/tmp');

            const renderer = new FFmpegVideoRenderer(mockMediaClient);

            expect((renderer as any).tempDir).toBe(path.join('/custom/tmp', 'reel-poster-renders'));
        });
    });
});
