import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Local storage client that saves media to the public/renders directory.
 * This provides zero-cost storage for the InstagramReelPoster project.
 */
export class LocalStorageClient {
    private readonly rendersDir: string;
    private readonly baseUrl: string;

    constructor(baseUrl: string = '') {
        this.rendersDir = path.join(process.cwd(), 'public', 'renders');
        this.baseUrl = baseUrl;

        // Ensure renders directory exists
        if (!fs.existsSync(this.rendersDir)) {
            fs.mkdirSync(this.rendersDir, { recursive: true });
        }
    }

    /**
     * Saves a local file or buffer to the renders directory and returns a public URL.
     */
    async store(
        sourcePathOrBuffer: string | Buffer,
        options: {
            filename?: string;
            extension?: string;
        } = {}
    ): Promise<{ url: string; publicId: string }> {
        const id = uuidv4();
        const extension = options.extension || (typeof sourcePathOrBuffer === 'string' ? path.extname(sourcePathOrBuffer).slice(1) : 'mp4');
        const filename = options.filename || `${id}.${extension}`;
        const targetPath = path.join(this.rendersDir, filename);

        if (typeof sourcePathOrBuffer === 'string') {
            fs.copyFileSync(sourcePathOrBuffer, targetPath);
        } else {
            fs.writeFileSync(targetPath, sourcePathOrBuffer);
        }

        // Generate URL (assuming /renders is served statically from public/)
        const url = `${this.baseUrl}/renders/${filename}`;

        return {
            url,
            publicId: id
        };
    }

    /**
     * Mock delete (optionally deletes the file).
     */
    async delete(publicId: string): Promise<void> {
        // We can implement actual deletion if needed, but for now we keep renders
        console.log(`[LocalStorage] Mark for deletion: ${publicId}`);
    }

    /**
     * Checks if a render exists.
     */
    exists(filename: string): boolean {
        return fs.existsSync(path.join(this.rendersDir, filename));
    }
}
