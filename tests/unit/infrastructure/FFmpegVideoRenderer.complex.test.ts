import fs from 'fs';
import os from 'os';
import axios from 'axios';

// Mock everything before imports
const mockFfmpegInstance = {
    input: jest.fn().mockReturnThis(),
    inputOptions: jest.fn().mockReturnThis(),
    complexFilter: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    save: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation(function (this: any, event: string, cb: any) {
        if (event === 'end') setTimeout(cb, 0);
        return this;
    })
};

jest.mock('fluent-ffmpeg', () => {
    return jest.fn(() => mockFfmpegInstance);
});

jest.mock('fs');
jest.mock('os');
jest.mock('axios');

import { FFmpegVideoRenderer } from '../../../src/infrastructure/video/FFmpegVideoRenderer';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;
const mockedAxios = axios as unknown as jest.Mock;

describe('FFmpegVideoRenderer (Indexing Fix)', () => {
    let mockCloudinaryClient: any;
    let renderer: FFmpegVideoRenderer;

    beforeEach(() => {
        jest.clearAllMocks();
        mockedOs.tmpdir.mockReturnValue('/tmp');
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.createWriteStream.mockReturnValue({
            on: jest.fn().mockImplementation((event, cb) => {
                if (event === 'finish') cb();
            })
        } as any);

        mockCloudinaryClient = {
            uploadFromUrl: jest.fn().mockResolvedValue({ url: 'https://final-video.mp4' }),
            uploadVideo: jest.fn().mockResolvedValue({ url: 'https://final-video.mp4' })
        };

        renderer = new FFmpegVideoRenderer(mockCloudinaryClient);

        mockedAxios.mockResolvedValue({
            data: {
                pipe: jest.fn().mockImplementation((writer) => {
                    // simulate download finish
                })
            }
        });
    });

    const baseParams = {
        durationSeconds: 10,
        voiceoverUrl: 'https://voice.mp3',
        subtitlesUrl: 'https://subs.srt',
    };

    it('should use [2:v] for visuals when music is present', async () => {
        const manifest: ReelManifest = {
            ...baseParams,
            musicUrl: 'https://music.mp3',
            animatedVideoUrl: 'https://anim.mp4'
        };

        // We need to mock downloadAssets return to avoid real disk/network
        // but since we mocked axios and fs, it should just work.

        await renderer.render(manifest);

        const filterCall = mockFfmpegInstance.complexFilter.mock.calls[0][0];
        // [0:a] voice, [1:a] music, [2:v] video
        expect(filterCall.some((s: string) => s.includes('[2:v]'))).toBe(true);
    });

    it('should use [1:v] for visuals when music is NOT present', async () => {
        const manifest: ReelManifest = {
            ...baseParams,
            animatedVideoUrl: 'https://anim.mp4'
        };

        await renderer.render(manifest);

        const filterCall = mockFfmpegInstance.complexFilter.mock.calls[0][0];
        // [0:a] voice, [1:v] video
        expect(filterCall.some((s: string) => s.includes('[1:v]'))).toBe(true);
        expect(filterCall.every((s: string) => !s.includes('[2:v]'))).toBe(true);
    });

    it('should handle image segments correctly without music', async () => {
        const manifest: ReelManifest = {
            ...baseParams,
            segments: [
                { index: 0, start: 0, end: 10, imageUrl: 'https://img.png' }
            ]
        };

        await renderer.render(manifest);

        const filterCall = mockFfmpegInstance.complexFilter.mock.calls[0][0];
        expect(filterCall.some((s: string) => s.includes('[1:v]'))).toBe(true);
    });
});
