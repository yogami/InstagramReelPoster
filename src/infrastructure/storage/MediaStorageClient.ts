import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

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
                console.log(`[MediaStorage] Local file detected, using chunked upload for robustness: ${url}`);
                const result = (await cloudinary.uploader.upload_large(url, {
                    folder,
                    public_id: options.publicId,
                    resource_type: resourceType,
                    chunk_size: 6000000, // 6MB chunks
                    overwrite: true,
                })) as any;

                return {
                    url: result.secure_url,
                    publicId: result.public_id,
                };
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
                    return await this.downloadAndUploadLarge(url, folder, options.publicId, resourceType);
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
        resourceType: any = 'video'
    ): Promise<{ url: string; publicId: string }> {
        const tempDir = path.join(process.cwd(), 'temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const tempPath = path.join(tempDir, `large_asset_${Date.now()}.mp4`);

        try {
            console.log(`[MediaStorage] Buffering large remote asset to: ${tempPath}`);
            const response = await axios({
                url,
                method: 'GET',
                responseType: 'stream',
                timeout: 600000 // 10 minutes for large downloads
            });

            const writer = fs.createWriteStream(tempPath);

            await new Promise((resolve, reject) => {
                response.data.on('error', (err: Error) => {
                    writer.close();
                    reject(new Error(`Download stream error: ${err.message}`));
                });
                writer.on('error', (err: Error) => {
                    writer.close();
                    reject(new Error(`Write stream error: ${err.message}`));
                });
                writer.on('finish', resolve);
                writer.on('close', resolve);

                response.data.pipe(writer);
            });

            // Ensure file handle is released and FS is synced
            await new Promise(resolve => setTimeout(resolve, 1000));

            if (!fs.existsSync(tempPath)) {
                throw new Error(`Buffering failed. File not found at ${tempPath}`);
            }

            const stats = fs.statSync(tempPath);
            if (stats.size === 0) {
                throw new Error('Buffering failed. Downloaded file is empty.');
            }

            console.log(`[MediaStorage] File ready for chunked upload (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

            // Use upload_large but wrap carefully to catch any emitted stream errors
            const result = await new Promise((resolve, reject) => {
                cloudinary.uploader.upload_large(tempPath, {
                    folder,
                    public_id: publicId,
                    resource_type: resourceType,
                    chunk_size: 6000000,
                    overwrite: true,
                }, (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                });
            }) as any;

            console.log(`[MediaStorage] Chunked upload successful: ${result.secure_url}`);

            return {
                url: result.secure_url,
                publicId: result.public_id,
            };
        } catch (error) {
            console.error(`[MediaStorage] downloadAndUploadLarge failed:`, error);
            throw error;
        } finally {
            try {
                if (fs.existsSync(tempPath)) {
                    fs.unlinkSync(tempPath);
                    console.log(`[MediaStorage] Cleaned up temp file: ${tempPath}`);
                }
            } catch (cleanupError) {
                console.warn(`[MediaStorage] Cleanup failed for ${tempPath}:`, cleanupError);
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
