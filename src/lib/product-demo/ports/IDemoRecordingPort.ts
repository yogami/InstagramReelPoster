/**
 * Demo Recording Port
 * 
 * Outbound interface for recording live demos of SaaS products.
 * Uses Playwright to navigate and record the product in action.
 */

import { DemoRecordingResult } from '../domain/entities/ProductDemo';

export interface DemoRecordingOptions {
    /** Product URL to demo */
    url: string;
    /** Optional specific pages/flows to record */
    pages?: string[];
    /** Instructions for the demo (e.g., "Click the create button, fill the form") */
    instructions?: string[];
    /** Maximum recording duration in seconds */
    maxDurationSeconds?: number;
    /** Viewport size */
    viewport?: { width: number; height: number };
}

export interface AuthCheckResult {
    /** Whether the product can be demoed without authentication */
    canDemoWithoutAuth: boolean;
    /** Type of auth required if any */
    authType?: 'login' | 'signup' | '2fa' | 'oauth' | 'none';
    /** URL of the demo/trial if found */
    demoUrl?: string;
    /** Whether a demo video is embedded */
    hasEmbeddedVideo?: boolean;
    /** URL of embedded video if found */
    embeddedVideoUrl?: string;
}

export interface IDemoRecordingPort {
    /**
     * Checks if the product can be recorded without authentication.
     * 
     * @param url - Product URL to check
     * @returns Auth check result
     */
    canRecordWithoutAuth(url: string): Promise<AuthCheckResult>;

    /**
     * Records a live demo of the product.
     * 
     * @param options - Recording options
     * @returns Recording result with video URL
     */
    recordLiveDemo(options: DemoRecordingOptions): Promise<DemoRecordingResult>;

    /**
     * Extracts an embedded demo video if available.
     * 
     * @param url - URL to check for embedded video
     * @returns Video URL if found
     */
    extractEmbeddedVideo(url: string): Promise<string | null>;
}
