
import { FFmpegVideoRenderer } from '../../../src/infrastructure/video/FFmpegVideoRenderer';
import { MediaStorageClient } from '../../../src/infrastructure/storage/MediaStorageClient';
import { ReelManifest } from '../../../src/domain/entities/ReelManifest';
import ffmpeg from 'fluent-ffmpeg';
import axios from 'axios';
import fs from 'fs';
import { EventEmitter } from 'events';

// Mocks
jest.mock('fluent-ffmpeg');
jest.mock('axios');
jest.mock('fs');
jest.mock('os', () => ({
    tmpdir: () => '/tmp',
    platform: () => 'darwin',
    type: () => 'Darwin'
}));
jest.mock('path', () => ({
    join: (...args: string[]) => args.join('/'),
    basename: (p: string) => p.split('/').pop() || ''
}));

describe('FFmpegVideoRenderer', () => {
    let renderer: FFmpegVideoRenderer;
    let mockCloudinaryClient: jest.Mocked<MediaStorageClient>;
    let mockFfmpegCommand: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockCloudinaryClient = {
            uploadFromUrl: jest.fn().mockResolvedValue({ url: 'http://cloud.com/video.mp4' }),
            uploadVideo: jest.fn().mockResolvedValue({ url: 'http://cloud.com/video.mp4' })
        } as any;

        // Mock FFmpeg builder pattern
        mockFfmpegCommand = {
            input: jest.fn().mockReturnThis(),
            inputOptions: jest.fn().mockReturnThis(),
            complexFilter: jest.fn().mockReturnThis(),
            outputOptions: jest.fn().mockReturnThis(),
            save: jest.fn().mockReturnThis(),
            on: jest.fn().mockImplementation((event, callback) => {
                if (event === 'end') {
                    // Store callback to trigger manually if needed, or invoke immediately for success path
                    // For async testing, we might want to delay invocation or expose a trigger
                    process.nextTick(callback);
                }
                return mockFfmpegCommand;
            })
        };
        (ffmpeg as unknown as jest.Mock).mockReturnValue(mockFfmpegCommand);

        // Mock FS
        (fs.existsSync as jest.Mock).mockReturnValue(false);
        (fs.mkdirSync as jest.Mock).mockImplementation(() => { });
        (fs.rmSync as jest.Mock).mockImplementation(() => { });
        (fs.writeFileSync as jest.Mock).mockImplementation(() => { });

        // Mock Write Stream
        const mockStream = new EventEmitter();
        (mockStream as any).pipe = jest.fn();
        (mockStream as any).close = jest.fn();
        (mockStream as any).end = jest.fn();
        (fs.createWriteStream as jest.Mock).mockReturnValue(mockStream);

        // Mock Axios (Download)
        const mockResponseStream = new EventEmitter();
        (mockResponseStream as any).pipe = jest.fn();
        process.nextTick(() => {
            mockResponseStream.emit('data', 'chunk');
            mockResponseStream.emit('end');
            mockStream.emit('finish'); // Trigger write stream finish when download ends
        });

        (axios as unknown as jest.Mock).mockResolvedValue({
            data: mockResponseStream
        });

        renderer = new FFmpegVideoRenderer(mockCloudinaryClient);
    });

    const manifest: ReelManifest = {
        voiceoverUrl: 'http://tts.com/vo.mp3',
        durationSeconds: 10,
        segments: [
            { index: 0, start: 0, end: 5, imageUrl: 'http://img.com/1.png' } as any,
            { index: 1, start: 5, end: 10, imageUrl: 'http://img.com/2.png' } as any
        ],
        subtitlesUrl: 'http://sub.com/sub.srt',
        musicUrl: 'http://music.com/song.mp3',
        musicDurationSeconds: 10
    };

    test('should render video with music and images', async () => {
        const result = await renderer.render(manifest);

        expect(result.videoUrl).toBe('http://cloud.com/video.mp4');
        expect(mockCloudinaryClient.uploadFromUrl).toHaveBeenCalled();

        // Check FFmpeg inputs (VO + Music + 2 Images)
        expect(mockFfmpegCommand.input).toHaveBeenCalledTimes(4);
    });

    test('should render video without music', async () => {
        const noMusicManifest = { ...manifest, musicUrl: undefined };
        await renderer.render(noMusicManifest);

        // Inputs: VO + 2 Images (No music)
        expect(mockFfmpegCommand.input).toHaveBeenCalledTimes(3);
    });

    test('should cleanup temp files on success', async () => {
        await renderer.render(manifest);
        expect(fs.rmSync).toHaveBeenCalledWith(expect.stringContaining('/tmp/reel-poster-renders'), expect.anything());
    });

    test('should cleanup temp files on error', async () => {
        mockCloudinaryClient.uploadFromUrl.mockRejectedValue(new Error('Upload failed'));

        await expect(renderer.render(manifest)).rejects.toThrow('Upload failed');
        expect(fs.rmSync).toHaveBeenCalled();
    });

    test('should handle download errors', async () => {
        (axios as unknown as jest.Mock).mockRejectedValue(new Error('Download failed'));

        await expect(renderer.render(manifest)).rejects.toThrow('Download failed');
        // Ensure cleanup still runs
        expect(fs.rmSync).toHaveBeenCalled();
    });

    test('should handle FFmpeg errors', async () => {
        // Override mock to trigger error instead of end
        mockFfmpegCommand.on.mockImplementation((event: string, cb: any) => {
            if (event === 'error') {
                process.nextTick(() => cb(new Error('FFmpeg failed')));
            }
            return mockFfmpegCommand;
        });

        await expect(renderer.render(manifest)).rejects.toThrow('FFmpeg error: FFmpeg failed');
    });

    test('should accept base64 data URLs for subtitles', async () => {
        const base64Manifest = {
            ...manifest,
            subtitlesUrl: 'data:application/x-subrip;base64,VEVTVAo='
        };

        await renderer.render(base64Manifest);

        // Should call writeFileSync for base64
        expect(fs.writeFileSync).toHaveBeenCalled();
        // Should not call axios for subtitles
        // Original manifest had 3 URLs (VO, Music, Img1, Img2) -> 4 calls
        // Base64 sub replaces one URL download? No, subtitles are part of assets.
        // Manifest: VO (http), Music (http), Sub (data), Seg1 (http), Seg2 (http).
        // Downloads: VO, Music, Seg1, Seg2 (4 http calls)
        // Subtitles handled via writeFileSync.

        const calls = (axios as unknown as jest.Mock).mock.calls;
        expect(calls.length).toBe(4);
    });

    test('should apply correct subtitle styling', async () => {
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        await renderer.render(manifest);
        // Verify complexFilter arguments
        expect(mockFfmpegCommand.complexFilter).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.stringContaining('MarginV=420'),
                expect.stringContaining('Alignment=2'),
                expect.stringContaining('FontSize=20')
            ]),
            expect.anything()
        );
    });
});
