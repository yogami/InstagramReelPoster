
import { MediaStorageClient } from '../../src/infrastructure/storage/MediaStorageClient';
import { getConfig } from '../../src/config';

describe('MediaStorageClient Metadata Operations', () => {
    let storage: MediaStorageClient;
    const config = getConfig();

    beforeAll(() => {
        storage = new MediaStorageClient(
            config.cloudinaryCloudName,
            config.cloudinaryApiKey,
            config.cloudinaryApiSecret
        );
    });

    it('should list and update metadata for a resource', async () => {
        // 1. Upload a test image
        const testImage = 'https://res.cloudinary.com/demo/image/upload/sample.jpg';
        const publicId = `test_metadata_${Date.now()}`;
        const upload = await storage.uploadImage(testImage, {
            folder: 'test-metadata-folder',
            publicId,
            tags: ['initial-tag']
        });

        expect(upload.publicId).toBeDefined();

        // 2. Update metadata
        const newTags = ['updated-tag', 'test-metadata'];
        const context = {
            author: 'antigravity',
            version: '2.0'
        };

        await storage.updateMetadata(upload.publicId, {
            tags: newTags,
            context,
            resourceType: 'image'
        });

        // Wait for Cloudinary search index to propagate
        console.log('Waiting 5s for Cloudinary indexing...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 3. Verify via list
        const resources = await storage.listResourcesInFolder('test-metadata-folder', 'image');
        console.log('Upload PublicId:', upload.publicId);
        console.log('Found Resources:', resources.map(r => r.publicId));

        const found = resources.find(r => r.publicId === upload.publicId);

        expect(found).toBeDefined();
        expect(found?.tags).toContain('updated-tag');
        expect(found?.context.author).toBe('antigravity');

        // Cleanup
        await storage.delete(upload.publicId, 'image');
    }, 60000);
});
