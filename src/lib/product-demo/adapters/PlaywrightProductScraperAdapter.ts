/**
 * Playwright Product Scraper Adapter
 * 
 * Scrapes SaaS product pages using Playwright.
 * Captures screenshots, extracts images, and detects demo buttons.
 * 
 * Note: This file uses page.evaluate() which runs in browser context.
 * The DOM types are available in the evaluate callback.
 */

/// <reference lib="dom" />

import { IProductScrapingPort, ProductScrapingOptions } from '../ports/IProductScrapingPort';
import { ProductAnalysis, ScrapedImage, DemoButtonResult } from '../domain/entities/ProductDemo';

export interface PlaywrightProductScraperDeps {
    /** Playwright page factory */
    createPage: () => Promise<PlaywrightPage>;
    /** Cloud storage for screenshots */
    uploadImage: (buffer: Buffer, filename: string) => Promise<string>;
}

interface PlaywrightPage {
    goto(url: string, options?: { timeout?: number }): Promise<void>;
    screenshot(options?: { fullPage?: boolean }): Promise<Buffer>;
    evaluate<T>(fn: () => T): Promise<T>;
    $(selector: string): Promise<unknown | null>;
    $$(selector: string): Promise<unknown[]>;
    close(): Promise<void>;
    waitForLoadState(state: 'load' | 'domcontentloaded' | 'networkidle'): Promise<void>;
}

export class PlaywrightProductScraperAdapter implements IProductScrapingPort {
    constructor(private readonly deps: PlaywrightProductScraperDeps) { }

    async scrapeProduct(options: ProductScrapingOptions): Promise<ProductAnalysis> {
        const page = await this.deps.createPage();

        try {
            console.log(`[ProductScraper] Scraping: ${options.url}`);
            await page.goto(options.url, { timeout: options.timeoutMs || 30000 });
            await page.waitForLoadState('networkidle');

            // Extract page content
            const content = await page.evaluate(() => {
                const getMetaContent = (name: string): string | undefined => {
                    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
                    return meta?.getAttribute('content') || undefined;
                };

                const getTextContent = (selector: string): string | undefined => {
                    const el = document.querySelector(selector);
                    return el?.textContent?.trim();
                };

                // Find hero/tagline
                const heroSelectors = ['h1', '.hero h1', '.hero-title', '[class*="hero"] h1'];
                let heroText = '';
                for (const sel of heroSelectors) {
                    const el = document.querySelector(sel);
                    if (el?.textContent) {
                        heroText = el.textContent.trim();
                        break;
                    }
                }

                // Extract features
                const features: string[] = [];
                const featureSelectors = [
                    '[class*="feature"] h3',
                    '[class*="benefit"] h3',
                    '.features li',
                    '[class*="card"] h3'
                ];
                for (const sel of featureSelectors) {
                    document.querySelectorAll(sel).forEach((el, i) => {
                        if (i < 6 && el.textContent) {
                            features.push(el.textContent.trim());
                        }
                    });
                    if (features.length > 0) break;
                }

                // Check for auth requirement
                const hasLoginButton = !!(
                    document.querySelector('[href*="login"], [href*="signin"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Log in'))
                );
                const hasSignupCTA = !!(
                    document.querySelector('[href*="signup"], [href*="register"], [href*="trial"]') ||
                    Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Sign up'))
                );

                // Check pricing model
                const pageText = document.body.innerText.toLowerCase();
                let pricingModel: 'free' | 'freemium' | 'paid' | 'enterprise' | 'unknown' = 'unknown';
                if (pageText.includes('free forever') || pageText.includes('100% free')) {
                    pricingModel = 'free';
                } else if (pageText.includes('free plan') || pageText.includes('free tier')) {
                    pricingModel = 'freemium';
                } else if (pageText.includes('enterprise') || pageText.includes('contact sales')) {
                    pricingModel = 'enterprise';
                } else if (pageText.includes('/month') || pageText.includes('/year')) {
                    pricingModel = 'paid';
                }

                return {
                    title: document.title,
                    metaDescription: getMetaContent('description') || getMetaContent('og:description'),
                    heroText,
                    features,
                    hasLoginButton,
                    hasSignupCTA,
                    pricingModel,
                    ogImage: getMetaContent('og:image')
                };
            });

            // Capture screenshots if requested
            let screenshots: string[] = [];
            if (options.captureScreenshots) {
                screenshots = await this.captureScreenshots(options.url, options.additionalPages);
            }

            // Extract images if requested
            let images: ScrapedImage[] = [];
            if (options.extractImages) {
                images = await this.extractImages(options.url);
            }

            // Find demo button
            const demoButton = await this.findDemoButton(options.url);

            // Extract product name from title
            const productName = content.title?.split(/[|\-–—]/)[0]?.trim() || 'Unknown Product';

            return {
                sourceUrl: options.url,
                productName,
                tagline: content.heroText,
                metaDescription: content.metaDescription,
                features: content.features,
                images,
                screenshots,
                demoButton: demoButton || undefined,
                requiresAuth: content.hasLoginButton && !content.hasSignupCTA,
                pricingModel: content.pricingModel
            };
        } finally {
            await page.close();
        }
    }

    async captureScreenshots(url: string, pages?: string[]): Promise<string[]> {
        const urls = [url, ...(pages || []).map(p => new URL(p, url).href)];
        const screenshots: string[] = [];

        for (const targetUrl of urls) {
            const page = await this.deps.createPage();
            try {
                await page.goto(targetUrl, { timeout: 30000 });
                await page.waitForLoadState('networkidle');

                const buffer = await page.screenshot({ fullPage: true });
                const filename = `screenshot_${Date.now()}_${screenshots.length}.png`;
                const uploadedUrl = await this.deps.uploadImage(buffer, filename);
                screenshots.push(uploadedUrl);
            } catch (error) {
                console.warn(`[ProductScraper] Failed to screenshot ${targetUrl}:`, error);
            } finally {
                await page.close();
            }
        }

        return screenshots;
    }

    async extractImages(url: string): Promise<ScrapedImage[]> {
        const page = await this.deps.createPage();

        try {
            await page.goto(url, { timeout: 30000 });
            await page.waitForLoadState('networkidle');

            const images = await page.evaluate(() => {
                const results: Array<{ src: string; alt?: string; context: string }> = [];

                document.querySelectorAll('img').forEach((img) => {
                    const src = img.src;
                    if (!src || src.startsWith('data:') || src.includes('logo') || src.includes('icon')) {
                        return;
                    }

                    // Determine context
                    let context = 'other';
                    const parent = img.closest('section, div');
                    const parentClass = parent?.className?.toLowerCase() || '';

                    if (parentClass.includes('hero') || img.closest('header')) {
                        context = 'hero';
                    } else if (parentClass.includes('feature') || parentClass.includes('benefit')) {
                        context = 'feature';
                    } else if (parentClass.includes('screenshot') || parentClass.includes('demo')) {
                        context = 'screenshot';
                    } else if (parentClass.includes('testimonial') || parentClass.includes('review')) {
                        context = 'testimonial';
                    }

                    results.push({
                        src,
                        alt: img.alt || undefined,
                        context
                    });
                });

                return results.slice(0, 10); // Limit to 10 images
            });

            return images.map(img => ({
                url: img.src,
                alt: img.alt,
                context: img.context as ScrapedImage['context']
            }));
        } finally {
            await page.close();
        }
    }

    async findDemoButton(url: string): Promise<DemoButtonResult | null> {
        const page = await this.deps.createPage();

        try {
            await page.goto(url, { timeout: 30000 });
            await page.waitForLoadState('networkidle');

            const result = await page.evaluate(() => {
                // Look for demo/trial buttons
                const selectors = [
                    'a[href*="demo"]',
                    'a[href*="trial"]',
                    'a[href*="try"]',
                    '[class*="cta"]'
                ];

                for (const sel of selectors) {
                    const el = document.querySelector(sel) as HTMLAnchorElement | null;
                    if (el) {
                        const href = el.getAttribute('href') || '';
                        const text = el.textContent?.trim() || '';

                        // Check if it's a video
                        if (href.includes('youtube') || href.includes('vimeo') || href.includes('.mp4')) {
                            return { found: true, type: 'video', url: href, buttonText: text };
                        }

                        // Check if it's signup
                        if (href.includes('signup') || href.includes('register')) {
                            return { found: true, type: 'signup', url: href, buttonText: text };
                        }

                        return { found: true, type: 'interactive', url: href, buttonText: text };
                    }
                }

                // Check for buttons by text
                const buttons = Array.from(document.querySelectorAll('button, a.button, .btn'));
                const demoButton = buttons.find(b => {
                    const text = b.textContent?.toLowerCase() || '';
                    return text.includes('demo') || text.includes('try') || text.includes('free trial');
                });

                if (demoButton) {
                    const href = demoButton.getAttribute('href') || '';
                    const text = demoButton.textContent?.trim() || '';
                    return { found: true, type: 'interactive', url: href, buttonText: text };
                }

                // Check for embedded videos
                const video = document.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"]');
                if (video) {
                    const src = video.getAttribute('src') || (video as HTMLVideoElement).currentSrc;
                    return { found: true, type: 'video', url: src, buttonText: 'Embedded Video' };
                }

                return { found: false, type: 'none' };
            });

            return result as DemoButtonResult;
        } finally {
            await page.close();
        }
    }
}
