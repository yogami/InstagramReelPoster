import { MediaStorageClient } from '../../../src/infrastructure/storage/MediaStorageClient';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock cloudinary and fs
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn(),
            destroy: jest.fn()
        },
        url: jest.fn()
    }
}));

jest.mock('fs');
jest.mock('os');

const mockedFs = fs as jest.Mocked<typeof fs>;
const mockedOs = os as jest.Mocked<typeof os>;

describe('MediaStorageClient', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockedOs.tmpdir.mockReturnValue('/tmp');
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.writeFileSync.mockImplementation(() => undefined);
        mockedFs.unlinkSync.mockImplementation(() => undefined);
    });

    describe('constructor', () => {
        test('should throw error if cloudName is missing', () => {
            expect(() => new MediaStorageClient('', 'key', 'secret'))
                .toThrow('Media credentials are required');
        });

        test('should throw error if apiKey is missing', () => {
            expect(() => new MediaStorageClient('cloud', '', 'secret'))
                .toThrow('Media credentials are required');
        });

        test('should throw error if apiSecret is missing', () => {
            expect(() => new MediaStorageClient('cloud', 'key', ''))
                .toThrow('Media credentials are required');
        });

        test('should configure cloudinary on creation', () => {
            new MediaStorageClient('mycloud', 'mykey', 'mysecret');

            expect(cloudinary.config).toHaveBeenCalledWith({
                cloud_name: 'mycloud',
                api_key: 'mykey',
                api_secret: 'mysecret',
                secure: true
            });
        });
    });

    describe('uploadFromUrl', () => {
        test('should upload file and return url and publicId', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/uploaded.mp4',
                public_id: 'instagram-reels/video1'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const result = await client.uploadFromUrl('https://example.com/video.mp4');

            expect(result.url).toBe('https://cloudinary.com/uploaded.mp4');
            expect(result.publicId).toBe('instagram-reels/video1');
        });

        test('should use provided folder and publicId', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/custom.mp4',
                public_id: 'custom-folder/custom-id'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            await client.uploadFromUrl('https://example.com/video.mp4', {
                folder: 'custom-folder',
                publicId: 'custom-id'
            });

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/video.mp4',
                expect.objectContaining({
                    folder: 'custom-folder',
                    public_id: 'custom-id'
                })
            );
        });

        test('should throw on upload failure', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockRejectedValueOnce(
                new Error('Upload failed: Invalid file')
            );

            const client = new MediaStorageClient('cloud', 'key', 'secret');

            await expect(client.uploadFromUrl('https://example.com/invalid.mp4'))
                .rejects.toThrow('Media upload failed: Upload failed: Invalid file');
        });
    });

    describe('uploadRawContent', () => {
        test('should write content to temp file and upload', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/subtitles.srt',
                public_id: 'instagram-reels/subtitles/mysubs'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const result = await client.uploadRawContent('1\n00:00:00,000 --> 00:00:05,000\nHello', 'mysubs.srt');

            expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
                path.join('/tmp', 'mysubs.srt'),
                '1\n00:00:00,000 --> 00:00:05,000\nHello',
                'utf-8'
            );
            expect(result.url).toBe('https://cloudinary.com/subtitles.srt');
        });

        test('should cleanup temp file after upload', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/file.srt',
                public_id: 'file'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            await client.uploadRawContent('content', 'file.srt');

            expect(mockedFs.unlinkSync).toHaveBeenCalled();
        });

        test('should cleanup temp file even on error', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockRejectedValueOnce(new Error('Upload failed'));

            const client = new MediaStorageClient('cloud', 'key', 'secret');

            await expect(client.uploadRawContent('content', 'file.srt')).rejects.toThrow();
            expect(mockedFs.unlinkSync).toHaveBeenCalled();
        });
    });

    describe('uploadAudio', () => {
        test('should upload audio with video resource type', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/audio.mp3',
                public_id: 'instagram-reels/audio/myaudio'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const result = await client.uploadAudio('https://example.com/audio.mp3');

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/audio.mp3',
                expect.objectContaining({
                    resource_type: 'video',
                    folder: 'instagram-reels/audio'
                })
            );
            expect(result.url).toBe('https://cloudinary.com/audio.mp3');
        });
    });

    describe('uploadImage', () => {
        test('should upload image with image resource type', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/image.png',
                public_id: 'instagram-reels/images/myimage'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const result = await client.uploadImage('https://example.com/image.png');

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/image.png',
                expect.objectContaining({
                    resource_type: 'image',
                    folder: 'instagram-reels/images'
                })
            );
            expect(result.url).toBe('https://cloudinary.com/image.png');
        });
    });

    describe('uploadVideo', () => {
        test('should upload video with video resource type', async () => {
            (cloudinary.uploader.upload as jest.Mock).mockResolvedValueOnce({
                secure_url: 'https://cloudinary.com/video.mp4',
                public_id: 'instagram-reels/videos/myvideo'
            });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const result = await client.uploadVideo('https://example.com/video.mp4');

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/video.mp4',
                expect.objectContaining({
                    resource_type: 'video',
                    folder: 'instagram-reels/videos'
                })
            );
            expect(result.url).toBe('https://cloudinary.com/video.mp4');
        });
    });

    describe('getUrl', () => {
        test('should return cloudinary URL for resource', () => {
            (cloudinary.url as jest.Mock).mockReturnValueOnce('https://cloudinary.com/resource.png');

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            const url = client.getUrl('my-public-id');

            expect(cloudinary.url).toHaveBeenCalledWith('my-public-id', {
                resource_type: 'image',
                secure: true
            });
            expect(url).toBe('https://cloudinary.com/resource.png');
        });

        test('should use provided resource type', () => {
            (cloudinary.url as jest.Mock).mockReturnValueOnce('https://cloudinary.com/video.mp4');

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            client.getUrl('video-id', 'video');

            expect(cloudinary.url).toHaveBeenCalledWith('video-id', {
                resource_type: 'video',
                secure: true
            });
        });
    });

    describe('delete', () => {
        test('should delete resource from cloudinary', async () => {
            (cloudinary.uploader.destroy as jest.Mock).mockResolvedValueOnce({ result: 'ok' });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            await client.delete('public-id-to-delete');

            expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('public-id-to-delete', {
                resource_type: 'image'
            });
        });

        test('should use provided resource type for deletion', async () => {
            (cloudinary.uploader.destroy as jest.Mock).mockResolvedValueOnce({ result: 'ok' });

            const client = new MediaStorageClient('cloud', 'key', 'secret');
            await client.delete('video-id', 'video');

            expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('video-id', {
                resource_type: 'video'
            });
        });
    });
});
