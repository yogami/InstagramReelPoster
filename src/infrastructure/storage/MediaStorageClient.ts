import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

/**
 * Media storage client for uploading files and getting public URLs.
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

    /**
     * Uploads a file from a URL to Media.
     */
    async uploadFromUrl(
        url: string,
        options: {
            folder?: string;
            publicId?: string;
            resourceType?: 'image' | 'video' | 'raw' | 'auto';
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        const resourceType = options.resourceType || 'auto';
        const isRemote = url.startsWith('http');
        const folder = options.folder || 'instagram-reels';

        try {
            // Case 1: Local file path
            if (!isRemote) {
                const stats = fs.statSync(url);
                const fileSizeInBytes = stats.size;
                const fileSizeInMB = fileSizeInBytes / (1024 * 1024);

                console.log(`[MediaStorage] Local file detected: ${url} (${fileSizeInMB.toFixed(2)} MB)`);

                if (fileSizeInMB < 90) {
                    // Use standard upload for files < 90MB (Cloudinary limit is usually 100MB for direct)
                    // This returns a proper Promise and avoids race conditions
                    const result = await cloudinary.uploader.upload(url, {
                        folder,
                        public_id: options.publicId,
                        resource_type: resourceType,
                        overwrite: true,
                    });

                    return {
                        url: result.secure_url,
                        publicId: result.public_id,
                    };
                } else {
                    console.log(`[MediaStorage] File > 90MB, using chunked upload_large.`);
                    // For large files, use upload_large. Note: verify if it returns Promise wrapped or Stream
                    // In v2, it usually returns a Promise if no callback is passed, but behavior can be tricky.
                    const result = (await cloudinary.uploader.upload_large(url, {
                        folder,
                        public_id: options.publicId,
                        resource_type: resourceType,
                        chunk_size: 6000000, // 6MB chunks
                        overwrite: true,
                    })) as any;

                    // Fallback check
                    if (!result.secure_url && result._events) {
                        throw new Error('Cloudinary upload_large returned a Stream instead of a Result. Please check SDK version compatibility.');
                    }

                    return {
                        url: result.secure_url,
                        publicId: result.public_id,
                    };
                }
            }

            // Case 2: Remote URL
            // Try regular upload first (most efficient server-side fetch)
            try {
                const result = await cloudinary.uploader.upload(url, {
                    folder,
                    public_id: options.publicId,
                    resource_type: resourceType,
                    overwrite: true,
                });

                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
            } catch (error: any) {
                // If it fails due to size (100MB limit for some tiers) or timeout, download and chunk-upload
                const isSizeError = error.message?.includes('too large') || error.http_code === 400;
                if (isSizeError && (resourceType === 'video' || resourceType === 'auto')) {
                    console.warn(`[MediaStorage] Remote video too large for direct fetch (>${(104857600 / 1024 / 1024).toFixed(0)}MB). Attempting local buffer + chunked upload...`);
                    const safeResourceType = resourceType === 'auto' ? 'video' : resourceType as 'image' | 'video' | 'raw';
                    return await this.downloadAndUploadLarge(url, folder, options.publicId, safeResourceType);
                }
                throw error;
            }
        } catch (error) {
            console.error('[Cloudinary] Detailed Error:', error);
            const message = error instanceof Error ? error.message : JSON.stringify(error) || 'Unknown error';
            throw new Error(`Media upload failed: ${message}`);
        }
    }

    /**
     * Downloads a remote file and uploads it in chunks to bypass server-side fetch limits.
     */
    private async downloadAndUploadLarge(
        url: string,
        folder: string,
        publicId?: string,
        resourceType: 'image' | 'video' | 'raw' = 'video'
    ): Promise<{ url: string; publicId: string }> {
        const tempPath = path.join(os.tmpdir(), `asset_${uuidv4()}.tmp`);
        console.log(`[MediaStorage] Buffering large asset to: ${tempPath}`);

        try {
            // 1. Download to local file
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 300000, // 5 minutes (reduced from 10 for better fail-fast)
            });

            const writer = fs.createWriteStream(tempPath);

            await new Promise<void>((resolve, reject) => {
                let hasError = false;
                const handleError = (err: Error) => {
                    if (hasError) return;
                    hasError = true;
                    writer.close();
                    reject(err);
                };

                response.data.on('error', (err: Error) => handleError(new Error(`Download stream error: ${err.message}`)));
                writer.on('error', (err: Error) => handleError(new Error(`Write stream error: ${err.message}`)));
                writer.on('finish', () => resolve());

                response.data.pipe(writer);
            });

            // 2. Upload to Cloudinary using chunked upload
            console.log(`[MediaStorage] Uploading buffered asset to Cloudinary (${resourceType})...`);

            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_large(tempPath, {
                    folder,
                    public_id: publicId,
                    resource_type: resourceType,
                    chunk_size: 6000000,
                    overwrite: true,
                }, (error, result) => {
                    if (error) {
                        console.error(`[MediaStorage] Cloudinary upload_large error:`, error);
                        reject(error);
                    } else {
                        resolve(result);
                    }
                });
            }) as any;

            if (!result || !result.secure_url) {
                throw new Error('Cloudinary upload_large failed: No secure_url in response');
            }

            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            console.error(`[MediaStorage] downloadAndUploadLarge failed:`, error instanceof Error ? error.message : error);
            throw error;
        } finally {
            // Clean up temp file
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                    console.log(`[MediaStorage] Cleaned up temp file: ${tempPath}`);
                }
            } catch (err) {
                console.warn(`[MediaStorage] Failed to cleanup temp file ${tempPath}:`, err);
            }
        }
    }

    /**
     * Uploads raw content (like SRT subtitles) to Media.
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
     * Uploads audio content to Media.
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
            resourceType: 'video', // Media uses 'video' for audio files
        });
    }

    /**
     * Uploads an image to Media.
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
     * Uploads a video to Media.
     */
    async uploadVideo(
        videoUrl: string,
        options: {
            folder?: string;
            publicId?: string;
            resourceType?: 'video';
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        return this.uploadFromUrl(videoUrl, {
            folder: options.folder || 'instagram-reels/videos',
            publicId: options.publicId,
            resourceType: 'video',
        });
    }

    /**
     * Gets a URL for a Media resource.
     */
    getUrl(publicId: string, resourceType: 'image' | 'video' | 'raw' = 'image'): string {
        return cloudinary.url(publicId, {
            resource_type: resourceType,
            secure: true,
        });
    }

    /**
     * Deletes a resource from Media.
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
