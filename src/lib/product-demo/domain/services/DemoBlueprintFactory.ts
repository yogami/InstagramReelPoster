/**
 * Demo Blueprint Factory
 * 
 * Creates narrative beat sequences for product demo videos.
 * Generates different structures based on target audience (investor vs client).
 */

import { v4 as uuidv4 } from 'uuid';
import { DemoBlueprint, DemoBeat, DemoBeatKind, VisualSource, BeatStyle, DemoScene } from '../entities/DemoBlueprint';
import { AudienceType, ProductAnalysis, GitHubContext } from '../entities/ProductDemo';

// ============================================================================
// Beat Templates
// ============================================================================

interface BeatTemplate {
    kind: DemoBeatKind;
    style: BeatStyle;
    baseDuration: number;
    visualSource: VisualSource;
    narrationTemplate: string;
    visualTemplate: string;
}

const INVESTOR_BEAT_TEMPLATES: BeatTemplate[] = [
    {
        kind: 'HOOK',
        style: 'cinematic_intro',
        baseDuration: 3,
        visualSource: 'generated',
        narrationTemplate: 'What if {{problem}} was no longer a problem?',
        visualTemplate: 'Cinematic wide shot representing {{industry}}, professional lighting, modern aesthetic'
    },
    {
        kind: 'PROBLEM',
        style: 'problem_illustration',
        baseDuration: 6,
        visualSource: 'generated',
        narrationTemplate: '{{problem}}. This costs businesses {{impact}} every year.',
        visualTemplate: 'Visual metaphor showing frustration with {{traditional_pain}}, muted colors, stress imagery'
    },
    {
        kind: 'TRADITIONAL_SOLUTION',
        style: 'pain_point_montage',
        baseDuration: 5,
        visualSource: 'generated',
        narrationTemplate: 'Traditional solutions like {{traditional_solutions}} are slow, expensive, and outdated.',
        visualTemplate: 'Montage of outdated tools and frustrated workers, grayscale with red accents'
    },
    {
        kind: 'PRODUCT_SOLUTION',
        style: 'product_showcase',
        baseDuration: 6,
        visualSource: 'scraped',
        narrationTemplate: '{{productName}} changes everything. {{solution}}',
        visualTemplate: 'Hero image or screenshot of {{productName}} interface, vibrant colors, modern design'
    },
    {
        kind: 'LIVE_DEMO',
        style: 'screen_recording',
        baseDuration: 15,
        visualSource: 'recorded',
        narrationTemplate: 'Watch how easy it is. {{demo_narration}}',
        visualTemplate: 'Screen recording of {{productName}} in action, highlighting key workflows'
    },
    {
        kind: 'FEATURES',
        style: 'feature_highlight',
        baseDuration: 8,
        visualSource: 'scraped',
        narrationTemplate: 'Key features include {{features}}.',
        visualTemplate: 'Feature screenshots from product page, clean layout with callouts'
    },
    {
        kind: 'SOCIAL_PROOF',
        style: 'stats_display',
        baseDuration: 4,
        visualSource: 'generated',
        narrationTemplate: '{{traction}}. Trusted by innovators.',
        visualTemplate: 'Animated statistics, growth charts, logos of notable users if available'
    },
    {
        kind: 'CTA',
        style: 'cta_finale',
        baseDuration: 3,
        visualSource: 'scraped',
        narrationTemplate: 'Join the future. {{productName}}.',
        visualTemplate: 'Product logo on gradient background, website URL overlay'
    }
];

const CLIENT_BEAT_TEMPLATES: BeatTemplate[] = [
    {
        kind: 'HOOK',
        style: 'cinematic_intro',
        baseDuration: 3,
        visualSource: 'generated',
        narrationTemplate: 'Tired of {{pain_point}}?',
        visualTemplate: 'Relatable scene of professional dealing with {{pain_point}}, warm lighting'
    },
    {
        kind: 'PROBLEM',
        style: 'problem_illustration',
        baseDuration: 5,
        visualSource: 'generated',
        narrationTemplate: 'You know the struggle. {{problem}}',
        visualTemplate: 'Day-in-the-life scene showing {{problem}} in action, empathetic imagery'
    },
    {
        kind: 'TRADITIONAL_SOLUTION',
        style: 'pain_point_montage',
        baseDuration: 4,
        visualSource: 'generated',
        narrationTemplate: 'Old tools just don\'t cut it anymore.',
        visualTemplate: 'Quick cuts of clunky interfaces and manual processes, muted tones'
    },
    {
        kind: 'PRODUCT_SOLUTION',
        style: 'product_showcase',
        baseDuration: 5,
        visualSource: 'scraped',
        narrationTemplate: 'Meet {{productName}}. {{solution}}',
        visualTemplate: 'Clean product screenshot, hero image from landing page'
    },
    {
        kind: 'LIVE_DEMO',
        style: 'screen_recording',
        baseDuration: 20,
        visualSource: 'recorded',
        narrationTemplate: 'Here\'s how it works. {{demo_narration}}',
        visualTemplate: 'Detailed screen recording showing step-by-step workflow'
    },
    {
        kind: 'FEATURES',
        style: 'feature_highlight',
        baseDuration: 6,
        visualSource: 'scraped',
        narrationTemplate: 'You get {{features}} and more.',
        visualTemplate: 'Feature cards or screenshots with brief annotations'
    },
    {
        kind: 'CTA',
        style: 'cta_finale',
        baseDuration: 3,
        visualSource: 'scraped',
        narrationTemplate: 'Try {{productName}} today. Your workflow will thank you.',
        visualTemplate: 'Product logo, signup button, website URL'
    }
];

// ============================================================================
// Demo Blueprint Factory
// ============================================================================

export class DemoBlueprintFactory {
    /**
     * Creates a demo blueprint based on audience type and product analysis.
     */
    create(
        analysis: ProductAnalysis,
        audienceType: AudienceType,
        githubContext?: GitHubContext,
        hasLiveDemo: boolean = false
    ): DemoBlueprint {
        const templates = audienceType === 'investor'
            ? INVESTOR_BEAT_TEMPLATES
            : CLIENT_BEAT_TEMPLATES;

        const beats = templates.map((template, index) =>
            this.createBeat(template, analysis, githubContext, hasLiveDemo, index)
        );

        // Filter out LIVE_DEMO beat if no live demo available
        const filteredBeats = hasLiveDemo
            ? beats
            : beats.filter(b => b.kind !== 'LIVE_DEMO');

        const totalDuration = filteredBeats.reduce((sum, b) => sum + b.duration, 0);

        return {
            beats: filteredBeats,
            audienceType,
            totalDuration,
            colorPalette: this.inferColorPalette(analysis),
            musicStyle: this.inferMusicStyle(audienceType, analysis),
            productName: analysis.productName
        };
    }

    /**
     * Converts a blueprint to scenes for script generation.
     */
    toScenes(blueprint: DemoBlueprint): DemoScene[] {
        return blueprint.beats.map((beat, index) => ({
            order: index + 1,
            duration: beat.duration,
            narration: beat.narration,
            subtitle: beat.narration, // Can be shortened later
            imagePrompt: beat.visualInstruction,
            role: beat.kind,
            visualSource: beat.visualSource
        }));
    }

    private createBeat(
        template: BeatTemplate,
        analysis: ProductAnalysis,
        githubContext: GitHubContext | undefined,
        hasLiveDemo: boolean,
        index: number
    ): DemoBeat {
        // If LIVE_DEMO but no recording, use screenshots instead
        let visualSource = template.visualSource;
        if (template.kind === 'LIVE_DEMO' && !hasLiveDemo) {
            visualSource = 'screenshot';
        }

        // If scraped images needed but none available, generate
        if (visualSource === 'scraped' && analysis.images.length === 0) {
            visualSource = 'generated';
        }

        return {
            id: uuidv4(),
            kind: template.kind,
            style: template.style,
            duration: template.baseDuration,
            visualSource,
            narration: this.interpolate(template.narrationTemplate, analysis, githubContext),
            visualInstruction: this.interpolate(template.visualTemplate, analysis, githubContext),
            assetUrl: this.findAssetForBeat(template.kind, analysis)
        };
    }

    private interpolate(
        template: string,
        analysis: ProductAnalysis,
        githubContext?: GitHubContext
    ): string {
        const replacements: Record<string, string> = {
            '{{productName}}': analysis.productName,
            '{{problem}}': analysis.problemStatement || 'complex workflows',
            '{{solution}}': analysis.solutionStatement || 'a smarter way to work',
            '{{pain_point}}': analysis.problemStatement || 'inefficient processes',
            '{{features}}': analysis.features.slice(0, 3).join(', ') || 'powerful features',
            '{{industry}}': analysis.targetAudience || 'modern business',
            '{{traditional_pain}}': 'outdated tools and manual processes',
            '{{traditional_solutions}}': 'spreadsheets and legacy software',
            '{{impact}}': 'millions',
            '{{traction}}': githubContext?.stars ? `${githubContext.stars}+ stars on GitHub` : 'Growing fast',
            '{{demo_narration}}': 'Watch as we demonstrate the key features.',
        };

        let result = template;
        for (const [key, value] of Object.entries(replacements)) {
            result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
        }
        return result;
    }

    private findAssetForBeat(kind: DemoBeatKind, analysis: ProductAnalysis): string | undefined {
        switch (kind) {
            case 'PRODUCT_SOLUTION':
            case 'CTA':
                // Prefer hero images
                const hero = analysis.images.find(img => img.context === 'hero');
                return hero?.url || analysis.screenshots[0];
            case 'FEATURES':
                // Prefer feature screenshots
                const feature = analysis.images.find(img => img.context === 'feature' || img.context === 'screenshot');
                return feature?.url;
            case 'LIVE_DEMO':
                // Use embedded video if available
                return analysis.embeddedVideoUrl;
            default:
                return undefined;
        }
    }

    private inferColorPalette(analysis: ProductAnalysis): string[] {
        // Default modern SaaS palette, could be extracted from screenshots
        return ['#6366F1', '#8B5CF6', '#EC4899', '#F43F5E', '#10B981'];
    }

    private inferMusicStyle(audienceType: AudienceType, analysis: ProductAnalysis): string {
        if (audienceType === 'investor') {
            return 'corporate-inspirational';
        }
        // Client pitch - more approachable
        return 'upbeat-modern';
    }
}
