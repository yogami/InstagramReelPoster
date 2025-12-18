import { CloudinaryStorageClient } from '../../../src/infrastructure/storage/CloudinaryStorageClient';

// Mock cloudinary SDK
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn(),
            destroy: jest.fn(),
        },
        url: jest.fn(),
    },
}));

import { v2 as cloudinary } from 'cloudinary';

describe('CloudinaryStorageClient', () => {
    const cloudName = 'test-cloud';
    const apiKey = 'test-api-key';
    const apiSecret = 'test-api-secret';

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor validation', () => {
        it('should throw error when cloudName is missing', () => {
            expect(() => new CloudinaryStorageClient('', apiKey, apiSecret))
                .toThrow('Cloudinary credentials are required');
        });

        it('should throw error when apiKey is missing', () => {
            expect(() => new CloudinaryStorageClient(cloudName, '', apiSecret))
                .toThrow('Cloudinary credentials are required');
        });

        it('should throw error when apiSecret is missing', () => {
            expect(() => new CloudinaryStorageClient(cloudName, apiKey, ''))
                .toThrow('Cloudinary credentials are required');
        });

        it('should configure cloudinary with valid credentials', () => {
            new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            expect(cloudinary.config).toHaveBeenCalledWith({
                cloud_name: cloudName,
                api_key: apiKey,
                api_secret: apiSecret,
                secure: true,
            });
        });
    });

    describe('uploadFromUrl()', () => {
        it('should upload from URL and return secure URL', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
                secure_url: 'https://res.cloudinary.com/test-cloud/image/upload/v1/folder/image.jpg',
                public_id: 'folder/image',
            });

            const result = await client.uploadFromUrl('https://example.com/source.jpg', {
                folder: 'test-folder',
                publicId: 'my-image',
            });

            expect(result.url).toBe('https://res.cloudinary.com/test-cloud/image/upload/v1/folder/image.jpg');
            expect(result.publicId).toBe('folder/image');
            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/source.jpg',
                expect.objectContaining({
                    folder: 'test-folder',
                    public_id: 'my-image',
                })
            );
        });

        it('should use default folder if not specified', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
                secure_url: 'https://res.cloudinary.com/test-cloud/image.jpg',
                public_id: 'instagram-reels/image',
            });

            await client.uploadFromUrl('https://example.com/source.jpg');

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/source.jpg',
                expect.objectContaining({
                    folder: 'instagram-reels',
                })
            );
        });

        it('should throw descriptive error on upload failure', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.upload as jest.Mock).mockRejectedValue(new Error('Invalid URL'));

            await expect(client.uploadFromUrl('bad-url')).rejects.toThrow('Cloudinary upload failed: Invalid URL');
        });
    });

    describe('uploadImage()', () => {
        it('should upload image with correct resource type', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
                secure_url: 'https://res.cloudinary.com/test-cloud/image.jpg',
                public_id: 'instagram-reels/images/test',
            });

            await client.uploadImage('https://example.com/image.jpg', {
                folder: 'custom-folder',
            });

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/image.jpg',
                expect.objectContaining({
                    resource_type: 'image',
                    folder: 'custom-folder',
                })
            );
        });
    });

    describe('uploadAudio()', () => {
        it('should upload audio with video resource type', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.upload as jest.Mock).mockResolvedValue({
                secure_url: 'https://res.cloudinary.com/test-cloud/audio.mp3',
                public_id: 'instagram-reels/audio/test',
            });

            await client.uploadAudio('https://example.com/audio.mp3');

            expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
                'https://example.com/audio.mp3',
                expect.objectContaining({
                    resource_type: 'video', // Cloudinary uses video for audio
                })
            );
        });
    });

    describe('getUrl()', () => {
        it('should return URL for given public ID', () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.url as jest.Mock).mockReturnValue('https://res.cloudinary.com/test-cloud/image/upload/test.jpg');

            const url = client.getUrl('test', 'image');

            expect(cloudinary.url).toHaveBeenCalledWith('test', {
                resource_type: 'image',
                secure: true,
            });
        });
    });

    describe('delete()', () => {
        it('should delete resource by public ID', async () => {
            const client = new CloudinaryStorageClient(cloudName, apiKey, apiSecret);

            (cloudinary.uploader.destroy as jest.Mock).mockResolvedValue({ result: 'ok' });

            await client.delete('test-public-id', 'image');

            expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('test-public-id', {
                resource_type: 'image',
            });
        });
    });
});
