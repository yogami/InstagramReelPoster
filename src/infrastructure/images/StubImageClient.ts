import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { IImageClient, ImageGenerationResult, ImageGenerationOptions } from '../../domain/ports/IImageClient';

/**
 * Zero-cost image client that generates moody gradient backgrounds via FFmpeg.
 * Used when no external image generation API is available.
 * Perfect for text-on-screen reels where the background is secondary to the text.
 */
export class StubImageClient implements IImageClient {
    async generateImage(
        prompt: string,
        options?: ImageGenerationOptions
    ): Promise<ImageGenerationResult> {
        const tmpPath = path.join(os.tmpdir(), `gradient_${Date.now()}.png`);

        // Pick gradient colors based on prompt keywords
        const colors = this.pickGradientColors(prompt);

        try {
            execSync(
                `ffmpeg -y -f lavfi -i "gradients=s=1080x1920:c0=${colors[0]}:c1=${colors[1]}:duration=1:speed=0.01" -frames:v 1 "${tmpPath}"`,
                { timeout: 10000, stdio: 'pipe' }
            );
        } catch {
            // gradients filter may not be available — use solid color fallback
            execSync(
                `ffmpeg -y -f lavfi -i "color=c=${colors[0]}:s=1080x1920:d=1" -frames:v 1 "${tmpPath}"`,
                { timeout: 10000, stdio: 'pipe' }
            );
        }

        console.log(`[StubImage] Generated gradient background: ${tmpPath}`);
        return { imageUrl: tmpPath };
    }

    private pickGradientColors(prompt: string): [string, string] {
        const lower = prompt.toLowerCase();
        if (lower.includes('warm') || lower.includes('love') || lower.includes('passion'))
            return ['#1a0a1e', '#3d1f3d'];
        if (lower.includes('cold') || lower.includes('trust') || lower.includes('loyalty'))
            return ['#0a1628', '#1a2d4d'];
        if (lower.includes('anger') || lower.includes('fight') || lower.includes('conflict'))
            return ['#1e0a0a', '#3d1f1f'];
        if (lower.includes('sad') || lower.includes('lonely') || lower.includes('distance'))
            return ['#0a0a1e', '#1f1f3d'];
        // Default: dark moody purple-blue
        return ['#0d0d1a', '#1a1a2e'];
    }
}
