import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Cloudinary storage client for uploading files and getting public URLs.
 */
export class CloudinaryStorageClient {
    constructor(
        cloudName: string,
        apiKey: string,
        apiSecret: string
    ) {
        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error('Cloudinary credentials are required (cloudName, apiKey, apiSecret)');
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });
    }

    /**
     * Uploads a file from a URL to Cloudinary.
     */
    async uploadFromUrl(
        url: string,
        options: {
            folder?: string;
            publicId?: string;
            resourceType?: 'image' | 'video' | 'raw' | 'auto';
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        try {
            const result = await cloudinary.uploader.upload(url, {
                folder: options.folder || 'instagram-reels',
                public_id: options.publicId,
                resource_type: options.resourceType || 'auto',
                overwrite: true,
            });

            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            throw new Error(`Cloudinary upload failed: ${message}`);
        }
    }

    /**
     * Uploads raw content (like SRT subtitles) to Cloudinary.
     */
    async uploadRawContent(
        content: string,
        filename: string,
        options: {
            folder?: string;
            publicId?: string;
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        // Write to temp file
        const tempDir = os.tmpdir();
        const tempPath = path.join(tempDir, filename);

        try {
            fs.writeFileSync(tempPath, content, 'utf-8');

            const result = await cloudinary.uploader.upload(tempPath, {
                folder: options.folder || 'instagram-reels/subtitles',
                public_id: options.publicId || path.parse(filename).name,
                resource_type: 'raw',
                overwrite: true,
            });

            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } finally {
            // Clean up temp file
            if (fs.existsSync(tempPath)) {
                fs.unlinkSync(tempPath);
            }
        }
    }

    /**
     * Uploads audio content to Cloudinary.
     */
    async uploadAudio(
        audioUrl: string,
        options: {
            folder?: string;
            publicId?: string;
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        return this.uploadFromUrl(audioUrl, {
            folder: options.folder || 'instagram-reels/audio',
            publicId: options.publicId,
            resourceType: 'video', // Cloudinary uses 'video' for audio files
        });
    }

    /**
     * Uploads an image to Cloudinary.
     */
    async uploadImage(
        imageUrl: string,
        options: {
            folder?: string;
            publicId?: string;
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        return this.uploadFromUrl(imageUrl, {
            folder: options.folder || 'instagram-reels/images',
            publicId: options.publicId,
            resourceType: 'image',
        });
    }

    /**
     * Gets a URL for a Cloudinary resource.
     */
    getUrl(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): string {
        return cloudinary.url(publicId, {
            resource_type: resourceType,
            secure: true,
        });
    }

    /**
     * Deletes a resource from Cloudinary.
     */
    async delete(
        publicId: string,
        resourceType: 'image' | 'video' | 'raw' = 'image'
    ): Promise<void> {
        await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });
    }
}
