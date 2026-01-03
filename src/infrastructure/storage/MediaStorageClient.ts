import { v2 as cloudinary } from 'cloudinary';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Media storage client for uploading files and getting public URLs.
 * Supports tags and structured metadata (context).
 */
export class MediaStorageClient {
    constructor(
        cloudName: string,
        apiKey: string,
        apiSecret: string
    ) {
        if (!cloudName || !apiKey || !apiSecret) {
            throw new Error('Media credentials are required (cloudName, apiKey, apiSecret)');
        }

        cloudinary.config({
            cloud_name: cloudName,
            api_key: apiKey,
            api_secret: apiSecret,
            secure: true,
        });
    }

    private truncate(str: string, len: number = 100): string {
        if (!str) return '';
        return str.length > len ? `${str.substring(0, len)}... [truncated ${str.length - len} chars]` : str;
    }

    /**
     * Uploads a file from a URL to Cloudinary with tags and metadata.
     */
    async uploadFromUrl(
        url: string,
        options: {
            folder?: string;
            publicId?: string;
            resourceType?: 'image' | 'video' | 'raw' | 'auto';
            tags?: string[];
            context?: Record<string, string | number | boolean>;
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        const resourceType = options.resourceType || 'auto';
        const isRemote = url.startsWith('http');
        const isDataUri = url.startsWith('data:');
        const folder = options.folder || 'instagram-reels';

        // Map context to Cloudinary format (key=value pipes)
        const context = options.context
            ? Object.entries(options.context).map(([k, v]) => `${k}=${v}`).join('|')
            : undefined;

        const uploadOptions = {
            folder,
            public_id: options.publicId,
            resource_type: resourceType,
            overwrite: true,
            tags: options.tags,
            context,
        };

        try {
            if (isDataUri) {
                console.log(`[MediaStorage] Data URI detected`);
                const result = await cloudinary.uploader.upload(url, uploadOptions);
                return { url: result.secure_url, publicId: result.public_id };
            }

            if (!isRemote) {
                const stats = fs.statSync(url);
                const fileSizeInMB = stats.size / (1024 * 1024);

                console.log(`[MediaStorage] Local file: ${this.truncate(url)} (${fileSizeInMB.toFixed(2)} MB)`);

                if (fileSizeInMB < 90) {
                    const result = await cloudinary.uploader.upload(url, uploadOptions);
                    return { url: result.secure_url, publicId: result.public_id };
                } else {
                    const result = (await cloudinary.uploader.upload_large(url, uploadOptions)) as any;
                    return { url: result.secure_url, publicId: result.public_id };
                }
            }

            try {
                const result = await cloudinary.uploader.upload(url, uploadOptions);
                return { url: result.secure_url, publicId: result.public_id };
            } catch (error: any) {
                const isSizeError = error.message?.includes('too large') || error.http_code === 400;
                if (isSizeError && (resourceType === 'video' || resourceType === 'auto')) {
                    const safeResourceType = resourceType === 'auto' ? 'video' : resourceType as 'image' | 'video' | 'raw';
                    return await this.downloadAndUploadLarge(url, folder, options.publicId, safeResourceType, options.tags, context);
                }
                throw error;
            }
        } catch (error: any) {
            throw new Error(`Media upload failed: ${error.message || 'Unknown error'}`);
        }
    }

    private async downloadAndUploadLarge(
        url: string,
        folder: string,
        publicId: string | undefined,
        resourceType: 'image' | 'video' | 'raw',
        tags?: string[],
        context?: string
    ): Promise<{ url: string; publicId: string }> {
        const tempPath = path.join(os.tmpdir(), `asset_${uuidv4()}.tmp`);
        try {
            const response = await axios({ url, method: 'GET', responseType: 'stream', timeout: 300000 });
            const writer = fs.createWriteStream(tempPath);
            await new Promise<void>((resolve, reject) => {
                response.data.pipe(writer);
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_large(tempPath, {
                    folder, public_id: publicId, resource_type: resourceType,
                    chunk_size: 6000000, overwrite: true, tags, context,
                }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                });
            }) as any;

            return { url: result.secure_url, publicId: result.public_id };
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    }

    async uploadVideo(url: string, options: { folder?: string; publicId?: string; tags?: string[]; context?: Record<string, string | number | boolean> } = {}) {
        return this.uploadFromUrl(url, { ...options, resourceType: 'video' });
    }

    async uploadImage(url: string, options: { folder?: string; publicId?: string; tags?: string[]; context?: Record<string, string | number | boolean> } = {}) {
        return this.uploadFromUrl(url, { ...options, resourceType: 'image' });
    }

    async uploadAudio(url: string, options: { folder?: string; publicId?: string; tags?: string[]; context?: Record<string, string | number | boolean> } = {}) {
        return this.uploadFromUrl(url, { ...options, resourceType: 'video' });
    }

    async uploadRawContent(content: string, filename: string, options: { folder?: string; publicId?: string; tags?: string[]; context?: Record<string, string | number | boolean> } = {}) {
        const tempPath = path.join(os.tmpdir(), filename);
        try {
            fs.writeFileSync(tempPath, content, 'utf-8');
            return await this.uploadFromUrl(tempPath, { ...options, resourceType: 'raw' });
        } finally {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
    }

    async updateMetadata(
        publicId: string,
        options: {
            tags?: string[];
            context?: Record<string, string | number | boolean>;
            resourceType?: 'image' | 'video' | 'raw';
        }
    ): Promise<void> {
        const resourceType = options.resourceType || 'image';
        const context = options.context
            ? Object.entries(options.context).map(([k, v]) => `${k}=${v}`).join('|')
            : undefined;

        await cloudinary.uploader.explicit(publicId, {
            type: 'upload',
            resource_type: resourceType,
            tags: options.tags,
            context: context,
        });
    }

    async listResourcesInFolder(
        folder: string,
        resourceType: 'image' | 'video' | 'raw' = 'video',
        maxResults: number = 100
    ): Promise<{ publicId: string; url: string; tags: string[]; context: Record<string, string> }[]> {
        const result = await cloudinary.search
            .expression(`folder:${folder} AND resource_type:${resourceType}`)
            .with_field('context')
            .with_field('tags')
            .max_results(maxResults)
            .execute();

        return result.resources.map((res: any) => ({
            publicId: res.public_id,
            url: res.secure_url,
            tags: res.tags || [],
            context: res.context || {},
        }));
    }

    async delete(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): Promise<void> {
        await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    }

    getUrl(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): string {
        return cloudinary.url(publicId, { resource_type: resourceType, secure: true });
    }
}
