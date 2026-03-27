/**
 * Demo Script Generation Port
 * 
 * Outbound interface for LLM-powered demo script generation.
 * Creates narration and visual instructions for product demos.
 */

import { DemoScript, DemoScene } from '../domain/entities/DemoBlueprint';
import { AudienceType, ProductAnalysis, GitHubContext } from '../domain/entities/ProductDemo';

export interface ScriptGenerationInput {
    /** Product analysis from scraping */
    productAnalysis: ProductAnalysis;
    /** Optional GitHub context */
    githubContext?: GitHubContext;
    /** Target audience */
    audienceType: AudienceType;
    /** Whether a live demo recording is available */
    hasLiveDemoRecording: boolean;
    /** Custom instructions from user */
    customInstructions?: string;
}

export interface IDemoScriptGenerationPort {
    /**
     * Generates a complete demo script with narration and visuals.
     * 
     * @param input - Script generation input
     * @returns Generated demo script
     */
    generateScript(input: ScriptGenerationInput): Promise<DemoScript>;

    /**
     * Refines the problem statement for a product.
     * 
     * @param analysis - Product analysis
     * @param githubContext - Optional GitHub context
     * @returns Refined problem statement
     */
    refineProblemStatement(
        analysis: ProductAnalysis,
        githubContext?: GitHubContext
    ): Promise<string>;

    /**
     * Generates narration for a specific scene.
     * 
     * @param scene - The scene to generate narration for
     * @param context - Product and audience context
     * @returns Narration text
     */
    generateSceneNarration(
        scene: DemoScene,
        context: { productName: string; audienceType: AudienceType }
    ): Promise<string>;
}
