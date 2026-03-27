/**
 * Playwright Demo Recorder Adapter
 * 
 * Records live demos of SaaS products using Playwright.
 * Handles auth detection and fallback strategies.
 * 
 * Note: This file uses page.evaluate() which runs in browser context.
 * The DOM types are available in the evaluate callback.
 */

/// <reference lib="dom" />

import { IDemoRecordingPort, DemoRecordingOptions, AuthCheckResult } from '../ports/IDemoRecordingPort';
import { DemoRecordingResult } from '../domain/entities/ProductDemo';

export interface PlaywrightDemoRecorderDeps {
    /** Browser context factory (with video recording) */
    createRecordingContext: (outputPath: string, viewport: { width: number; height: number }) => Promise<PlaywrightRecordingContext>;
    /** Upload video to cloud storage */
    uploadVideo: (filePath: string) => Promise<string>;
    /** Temp directory for recordings */
    tempDir: string;
}

interface PlaywrightRecordingContext {
    newPage(): Promise<PlaywrightRecordingPage>;
    close(): Promise<void>;
}

interface PlaywrightRecordingPage {
    goto(url: string, options?: { timeout?: number; waitUntil?: string }): Promise<void>;
    waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
    click(selector: string, options?: { timeout?: number }): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    evaluate<T>(fn: () => T): Promise<T>;
    close(): Promise<void>;
    video(): { path(): Promise<string> } | null;
}

export class PlaywrightDemoRecorderAdapter implements IDemoRecordingPort {
    constructor(private readonly deps: PlaywrightDemoRecorderDeps) { }

    async canRecordWithoutAuth(url: string): Promise<AuthCheckResult> {
        // For now, we'll do a lightweight check
        // In production, this would navigate to the URL and check for auth walls
        console.log(`[DemoRecorder] Checking auth requirements for: ${url}`);

        try {
            // Simple heuristics based on URL patterns
            const urlLower = url.toLowerCase();

            // Check for common demo/trial patterns that don't require auth
            const noAuthPatterns = ['/demo', '/try', '/playground', '/sandbox', '/explore'];
            const hasDemoPath = noAuthPatterns.some(p => urlLower.includes(p));

            // Check for patterns that typically require auth
            const authPatterns = ['/app', '/dashboard', '/login', '/signin', '/account'];
            const hasAuthPath = authPatterns.some(p => urlLower.includes(p));

            if (hasDemoPath && !hasAuthPath) {
                return {
                    canDemoWithoutAuth: true,
                    authType: 'none',
                    demoUrl: url
                };
            }

            if (hasAuthPath) {
                return {
                    canDemoWithoutAuth: false,
                    authType: 'login'
                };
            }

            // Default: assume landing pages can be recorded
            return {
                canDemoWithoutAuth: true,
                authType: 'none',
                demoUrl: url
            };
        } catch (error) {
            console.error('[DemoRecorder] Error checking auth:', error);
            return {
                canDemoWithoutAuth: false,
                authType: 'login'
            };
        }
    }

    async recordLiveDemo(options: DemoRecordingOptions): Promise<DemoRecordingResult> {
        const viewport = options.viewport || { width: 1280, height: 720 };
        const maxDuration = options.maxDurationSeconds || 30;
        const outputPath = `${this.deps.tempDir}/demo_${Date.now()}`;

        console.log(`[DemoRecorder] Starting recording: ${options.url}`);

        const context = await this.deps.createRecordingContext(outputPath, viewport);
        const page = await context.newPage();

        try {
            // Navigate to the product
            await page.goto(options.url, { timeout: 30000, waitUntil: 'networkidle' });
            await page.waitForLoadState('networkidle');

            // Check for auth wall
            const hasAuthWall = await page.evaluate(() => {
                const pageText = document.body.innerText.toLowerCase();
                const authIndicators = ['sign in', 'log in', 'create account', 'sign up to continue'];
                return authIndicators.some(i => pageText.includes(i));
            });

            if (hasAuthWall) {
                await page.close();
                await context.close();
                return {
                    videoUrl: '',
                    durationSeconds: 0,
                    wasAuthenticated: true,
                    success: false,
                    failureReason: 'Authentication required'
                };
            }

            // Execute demo instructions if provided
            if (options.instructions && options.instructions.length > 0) {
                await this.executeInstructions(page, options.instructions);
            } else {
                // Default demo: scroll through the page
                await this.performDefaultDemo(page, maxDuration);
            }

            // Get video path and upload
            await page.close();
            await context.close();

            const videoPath = await page.video()?.path();
            if (!videoPath) {
                return {
                    videoUrl: '',
                    durationSeconds: 0,
                    wasAuthenticated: false,
                    success: false,
                    failureReason: 'Video recording failed'
                };
            }

            const videoUrl = await this.deps.uploadVideo(videoPath);

            return {
                videoUrl,
                durationSeconds: maxDuration,
                wasAuthenticated: false,
                success: true
            };
        } catch (error) {
            await page.close().catch(() => { });
            await context.close().catch(() => { });

            return {
                videoUrl: '',
                durationSeconds: 0,
                wasAuthenticated: false,
                success: false,
                failureReason: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    async extractEmbeddedVideo(url: string): Promise<string | null> {
        // This would require a page visit to find embedded videos
        // For now, return null - can be enhanced later
        console.log(`[DemoRecorder] Checking for embedded video at: ${url}`);
        return null;
    }

    private async executeInstructions(page: PlaywrightRecordingPage, instructions: string[]): Promise<void> {
        for (const instruction of instructions) {
            console.log(`[DemoRecorder] Executing: ${instruction}`);

            // Parse simple instruction format
            const normalized = instruction.toLowerCase().trim();

            if (normalized.startsWith('wait ')) {
                const ms = parseInt(normalized.replace('wait ', '').replace('ms', ''));
                await page.waitForTimeout(ms || 1000);
            } else if (normalized.startsWith('click ')) {
                const selector = instruction.substring(6).trim();
                await page.click(selector, { timeout: 5000 }).catch(() => { });
            } else if (normalized.startsWith('scroll')) {
                await page.evaluate(() => window.scrollBy(0, 300));
                await page.waitForTimeout(500);
            }

            // Add delay between actions
            await page.waitForTimeout(800);
        }
    }

    private async performDefaultDemo(page: PlaywrightRecordingPage, maxDuration: number): Promise<void> {
        const scrollInterval = 2000; // 2 seconds per scroll
        const scrollCount = Math.floor((maxDuration * 1000) / scrollInterval);

        for (let i = 0; i < scrollCount; i++) {
            await page.evaluate(() => window.scrollBy({ top: 300, behavior: 'smooth' }));
            await page.waitForTimeout(scrollInterval);
        }

        // Scroll back to top
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
        await page.waitForTimeout(1000);
    }
}
