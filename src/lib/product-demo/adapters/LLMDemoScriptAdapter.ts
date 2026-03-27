/**
 * LLM Demo Script Adapter
 * 
 * Generates demo video scripts using LLM.
 * Creates narration and visual instructions based on product analysis.
 */

import { IDemoScriptGenerationPort, ScriptGenerationInput } from '../ports/IDemoScriptGenerationPort';
import { DemoScript, DemoScene, DemoBeatKind, VisualSource } from '../domain/entities/DemoBlueprint';
import { AudienceType, ProductAnalysis, GitHubContext } from '../domain/entities/ProductDemo';
import { DemoBlueprintFactory } from '../domain/services/DemoBlueprintFactory';

export interface LLMDemoScriptAdapterDeps {
    /** LLM client for script generation */
    llmClient: {
        generateText(prompt: string): Promise<string>;
    };
}

// ============================================================================
// Prompts
// ============================================================================

const SCRIPT_GENERATION_PROMPT = `You are a professional video script writer specializing in SaaS product demos.

Create a compelling demo video script for the following product:

PRODUCT INFORMATION:
- Name: {{productName}}
- Tagline: {{tagline}}
- Problem: {{problem}}
- Solution: {{solution}}
- Features: {{features}}
{{#githubContext}}
- Tech Stack: {{techStack}}
- GitHub Stars: {{stars}}
{{/githubContext}}

TARGET AUDIENCE: {{audienceType}}
{{#isInvestor}}
Focus on: market opportunity, differentiation, traction potential, scalability
Tone: Professional, confident, data-driven
{{/isInvestor}}
{{#isClient}}
Focus on: pain points, ease of use, immediate benefits, quick wins
Tone: Friendly, empathetic, practical
{{/isClient}}

LIVE DEMO AVAILABLE: {{hasLiveDemo}}

Create a script with the following scenes:
1. HOOK (3s): Attention-grabbing opening
2. PROBLEM (6s): Describe the pain point
3. TRADITIONAL_SOLUTION (5s): What people currently do (the old way)
4. PRODUCT_SOLUTION (6s): How this product solves it
{{#hasLiveDemo}}
5. LIVE_DEMO (15s): Narration for the screen recording
{{/hasLiveDemo}}
6. FEATURES (8s): Key features highlight
{{#isInvestor}}
7. SOCIAL_PROOF (4s): Traction/validation
{{/isInvestor}}
8. CTA (3s): Call to action

Respond in JSON format:
{
    "productName": "string",
    "coreMessage": "One sentence value proposition",
    "scenes": [
        {
            "order": 1,
            "duration": 3,
            "narration": "Full narration text for voiceover",
            "subtitle": "Short subtitle for on-screen text",
            "imagePrompt": "Detailed image generation prompt OR 'USE_SCRAPED' OR 'USE_RECORDING'",
            "role": "HOOK|PROBLEM|TRADITIONAL_SOLUTION|PRODUCT_SOLUTION|LIVE_DEMO|FEATURES|SOCIAL_PROOF|CTA",
            "visualSource": "scraped|generated|recorded"
        }
    ],
    "musicStyle": "corporate-inspirational|upbeat-modern|calm-professional",
    "caption": "Social media caption for the video"
}`;

// ============================================================================
// Adapter
// ============================================================================

export class LLMDemoScriptAdapter implements IDemoScriptGenerationPort {
    private readonly blueprintFactory = new DemoBlueprintFactory();

    constructor(private readonly deps: LLMDemoScriptAdapterDeps) { }

    async generateScript(input: ScriptGenerationInput): Promise<DemoScript> {
        console.log(`[DemoScript] Generating script for: ${input.productAnalysis.productName}`);

        const prompt = this.buildPrompt(input);
        const response = await this.deps.llmClient.generateText(prompt);

        return this.parseResponse(response, input);
    }

    async refineProblemStatement(
        analysis: ProductAnalysis,
        githubContext?: GitHubContext
    ): Promise<string> {
        const prompt = `Given this SaaS product information, write a clear, concise problem statement (max 2 sentences):

Product: ${analysis.productName}
Description: ${analysis.metaDescription || 'N/A'}
Features: ${analysis.features.join(', ')}
${githubContext?.description ? `GitHub Description: ${githubContext.description}` : ''}

Problem statement:`;

        const response = await this.deps.llmClient.generateText(prompt);
        return response.trim();
    }

    async generateSceneNarration(
        scene: DemoScene,
        context: { productName: string; audienceType: AudienceType }
    ): Promise<string> {
        const prompt = `Write a ${scene.duration}-second voiceover narration for a ${scene.role} scene in a ${context.audienceType} demo video for ${context.productName}.

Current scene narration: "${scene.narration}"

Improve this narration to be more engaging and natural for voiceover. Keep it concise (about ${Math.floor(scene.duration * 2.5)} words).`;

        return this.deps.llmClient.generateText(prompt);
    }

    private buildPrompt(input: ScriptGenerationInput): string {
        const { productAnalysis, githubContext, audienceType, hasLiveDemoRecording } = input;

        let prompt = SCRIPT_GENERATION_PROMPT
            .replace('{{productName}}', productAnalysis.productName)
            .replace('{{tagline}}', productAnalysis.tagline || 'N/A')
            .replace('{{problem}}', productAnalysis.problemStatement || 'N/A')
            .replace('{{solution}}', productAnalysis.solutionStatement || 'N/A')
            .replace('{{features}}', productAnalysis.features.join(', ') || 'N/A')
            .replace('{{audienceType}}', audienceType)
            .replace('{{hasLiveDemo}}', String(hasLiveDemoRecording));

        // Handle mustache-like conditionals
        if (githubContext) {
            prompt = prompt
                .replace('{{#githubContext}}', '')
                .replace('{{/githubContext}}', '')
                .replace('{{techStack}}', githubContext.techStack.join(', '))
                .replace('{{stars}}', String(githubContext.stars || 0));
        } else {
            prompt = prompt.replace(/\{\{#githubContext\}\}[\s\S]*?\{\{\/githubContext\}\}/g, '');
        }

        if (audienceType === 'investor') {
            prompt = prompt
                .replace('{{#isInvestor}}', '')
                .replace('{{/isInvestor}}', '')
                .replace(/\{\{#isClient\}\}[\s\S]*?\{\{\/isClient\}\}/g, '');
        } else {
            prompt = prompt
                .replace('{{#isClient}}', '')
                .replace('{{/isClient}}', '')
                .replace(/\{\{#isInvestor\}\}[\s\S]*?\{\{\/isInvestor\}\}/g, '');
        }

        if (hasLiveDemoRecording) {
            prompt = prompt
                .replace('{{#hasLiveDemo}}', '')
                .replace('{{/hasLiveDemo}}', '');
        } else {
            prompt = prompt.replace(/\{\{#hasLiveDemo\}\}[\s\S]*?\{\{\/hasLiveDemo\}\}/g, '');
        }

        return prompt;
    }

    private parseResponse(response: string, input: ScriptGenerationInput): DemoScript {
        try {
            // Extract JSON from response
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            // Validate and normalize scenes
            const scenes: DemoScene[] = (parsed.scenes || []).map((scene: any, index: number) => ({
                order: scene.order || index + 1,
                duration: scene.duration || 5,
                narration: scene.narration || '',
                subtitle: scene.subtitle || scene.narration?.substring(0, 50) || '',
                imagePrompt: scene.imagePrompt || 'Product demo scene',
                role: this.normalizeRole(scene.role),
                visualSource: this.normalizeVisualSource(scene.visualSource)
            }));

            // Calculate full narration
            const fullNarration = scenes.map(s => s.narration).join(' ');
            const estimatedDuration = scenes.reduce((sum, s) => sum + s.duration, 0);

            return {
                audienceType: input.audienceType,
                productName: parsed.productName || input.productAnalysis.productName,
                coreMessage: parsed.coreMessage || 'Transforming how you work',
                scenes,
                fullNarration,
                estimatedDurationSeconds: estimatedDuration,
                musicStyle: parsed.musicStyle || 'upbeat-modern',
                caption: parsed.caption || `Check out ${input.productAnalysis.productName}!`,
                language: 'en'
            };
        } catch (error) {
            console.error('[DemoScript] Failed to parse LLM response, using fallback:', error);
            return this.createFallbackScript(input);
        }
    }

    private createFallbackScript(input: ScriptGenerationInput): DemoScript {
        const { productAnalysis, audienceType, hasLiveDemoRecording } = input;
        const blueprint = this.blueprintFactory.create(productAnalysis, audienceType, undefined, hasLiveDemoRecording);
        const scenes = this.blueprintFactory.toScenes(blueprint);

        return {
            audienceType,
            productName: productAnalysis.productName,
            coreMessage: productAnalysis.tagline || 'A smarter way to work',
            scenes,
            fullNarration: scenes.map(s => s.narration).join(' '),
            estimatedDurationSeconds: blueprint.totalDuration,
            musicStyle: blueprint.musicStyle,
            caption: `Discover ${productAnalysis.productName} - ${productAnalysis.tagline || 'the future of productivity'}`,
            language: 'en'
        };
    }

    private normalizeRole(role: string): DemoBeatKind {
        const normalized = role?.toUpperCase();
        const validRoles: DemoBeatKind[] = ['HOOK', 'PROBLEM', 'TRADITIONAL_SOLUTION', 'PRODUCT_SOLUTION', 'LIVE_DEMO', 'FEATURES', 'SOCIAL_PROOF', 'CTA'];
        return validRoles.includes(normalized as DemoBeatKind) ? (normalized as DemoBeatKind) : 'FEATURES';
    }

    private normalizeVisualSource(source: string): VisualSource {
        const normalized = source?.toLowerCase();
        const validSources: VisualSource[] = ['scraped', 'generated', 'recorded', 'screenshot'];
        return validSources.includes(normalized as VisualSource) ? (normalized as VisualSource) : 'generated';
    }
}
