/**
 * YouTubeSceneAnalyzer - Intelligent scene analysis for YouTube Shorts.
 *
 * Uses LLM to deeply analyze each scene from a YouTube Short script,
 * disambiguate technical terms, determine if VIDEO or IMAGE is needed,
 * and generate ultra-detailed prompts for accurate visual generation.
 */

import axios from 'axios';
import { YouTubeScene } from '../../domain/entities/YouTubeShort';
import { getConfig } from '../../config';

/**
 * Visual specification for a scene.
 */
export interface VisualSpec {
    perspective: 'satellite' | 'aerial' | 'ground-level' | 'closeup' | 'macro' | 'abstract';
    style: 'photorealistic' | 'cgi' | '3d-animation' | '2d-animation' | 'documentary' | 'artistic' | 'cinematic';
    subjects: string[];
    action: string;
    mood: string;
    era?: string;
    colorPalette?: string;
}

/**
 * Analyzed scene with enhanced prompt and asset type decision.
 */
export interface AnalyzedScene {
    /** Original scene data */
    original: YouTubeScene;

    /** Whether this scene needs VIDEO (motion) or IMAGE (static + Ken Burns) */
    assetType: 'video' | 'image';

    /** Ultra-detailed, unambiguous prompt for generation */
    enhancedPrompt: string;

    /** Structured visual specifications */
    visualSpec: VisualSpec;

    /** LLM's reasoning for the interpretation */
    reasoning: string;

    /** Confidence score 0-1 */
    confidence: number;
}

/**
 * Full script analysis result.
 */
export interface ScriptAnalysis {
    title: string;
    overallTone: string;
    scenes: AnalyzedScene[];
    /** Any warnings or ambiguities found */
    warnings: string[];
}

const SCENE_ANALYSIS_PROMPT = `You are an expert video production AI specializing in YouTube Shorts. Your task is to analyze a video script and generate precise, unambiguous visual prompts for AI video/image generation.

## Your Goals:
1. **Disambiguate technical terms** - "Indian plate" means the tectonic plate of the Indian subcontinent, not a dinner plate
2. **Determine asset type** - Does this scene NEED motion (VIDEO) or is it static (IMAGE with camera movement)?
3. **Generate ultra-detailed prompts** - Leave NO room for misinterpretation
4. **Specify visual style** - Perspective, rendering style, mood, era

## Full Script Context:
{FULL_SCRIPT}

## Scene to Analyze:
Title: {SCENE_TITLE}
Duration: {SCENE_DURATION} seconds
Visual Description: {VISUAL_PROMPT}
Narration: {NARRATION}

## Output Format (JSON):
{
  "assetType": "video" | "image",
  "enhancedPrompt": "Ultra-detailed prompt for video/image generation. Include: perspective, subjects, action, style, mood, colors, era. Be explicit about what things ARE, not what they're called.",
  "visualSpec": {
    "perspective": "satellite | aerial | ground-level | closeup | macro | abstract",
    "style": "photorealistic | cgi | 3d-animation | 2d-animation | documentary | artistic | cinematic",
    "subjects": ["list", "of", "main", "visual", "subjects"],
    "action": "what is happening/moving in the scene",
    "mood": "emotional tone",
    "era": "time period if relevant",
    "colorPalette": "dominant colors"
  },
  "reasoning": "Brief explanation of your interpretation and why you chose video vs image",
  "confidence": 0.0-1.0
}

## Decision Rules for assetType:
- **VIDEO**: Scene describes motion, transformation, flowing, racing, growing, colliding, moving clouds, flowing water, etc.
- **IMAGE**: Static subjects, portraits, landscapes with no described motion, establishing shots, quote cards

Respond ONLY with valid JSON, no markdown.`;

export class YouTubeSceneAnalyzer {
    private readonly apiKey: string;
    private readonly model: string;

    constructor() {
        const config = getConfig();
        this.apiKey = config.llmApiKey;
        this.model = 'gpt-4o'; // Use GPT-4o for best visual understanding
    }

    /**
     * Analyzes all scenes in a YouTube Short script.
     */
    async analyzeScript(
        title: string,
        scenes: YouTubeScene[],
        tone: string,
        fullScriptText: string
    ): Promise<ScriptAnalysis> {
        console.log(`[SceneAnalyzer] Analyzing ${scenes.length} scenes for "${title}"...`);

        const analyzedScenes: AnalyzedScene[] = [];
        const warnings: string[] = [];

        for (let i = 0; i < scenes.length; i++) {
            const scene = scenes[i];
            console.log(`[SceneAnalyzer] Analyzing scene ${i + 1}/${scenes.length}: "${scene.title}"...`);

            try {
                const analyzed = await this.analyzeScene(scene, fullScriptText);
                analyzedScenes.push(analyzed);

                if (analyzed.confidence < 0.7) {
                    warnings.push(`Scene ${i + 1} "${scene.title}": Low confidence interpretation (${(analyzed.confidence * 100).toFixed(0)}%)`);
                }
            } catch (error) {
                console.error(`[SceneAnalyzer] Failed to analyze scene ${i + 1}:`, error);
                // Fallback to basic enhancement
                analyzedScenes.push(this.createFallbackAnalysis(scene));
                warnings.push(`Scene ${i + 1} "${scene.title}": Analysis failed, using fallback`);
            }
        }

        console.log(`[SceneAnalyzer] Analysis complete. ${warnings.length} warnings.`);

        return {
            title,
            overallTone: tone,
            scenes: analyzedScenes,
            warnings,
        };
    }

    /**
     * Analyzes a single scene using LLM.
     */
    private async analyzeScene(scene: YouTubeScene, fullScriptText: string): Promise<AnalyzedScene> {
        const prompt = SCENE_ANALYSIS_PROMPT
            .replace('{FULL_SCRIPT}', fullScriptText)
            .replace('{SCENE_TITLE}', scene.title)
            .replace('{SCENE_DURATION}', String(scene.durationSeconds))
            .replace('{VISUAL_PROMPT}', scene.visualPrompt)
            .replace('{NARRATION}', scene.narration);

        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: this.model,
                messages: [
                    { role: 'system', content: 'You are a video production expert. Respond only with valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 1000,
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        const responseText = response.data.choices[0]?.message?.content || '';
        const parsed = this.parseAnalysisResponse(responseText);

        return {
            original: scene,
            assetType: parsed.assetType,
            enhancedPrompt: parsed.enhancedPrompt,
            visualSpec: parsed.visualSpec,
            reasoning: parsed.reasoning,
            confidence: parsed.confidence,
        };
    }

    /**
     * Parses LLM JSON response with error handling.
     */
    private parseAnalysisResponse(responseText: string): {
        assetType: 'video' | 'image';
        enhancedPrompt: string;
        visualSpec: VisualSpec;
        reasoning: string;
        confidence: number;
    } {
        try {
            // Try to extract JSON from response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                throw new Error('No JSON found in response');
            }

            const parsed = JSON.parse(jsonMatch[0]);

            return {
                assetType: parsed.assetType === 'image' ? 'image' : 'video',
                enhancedPrompt: parsed.enhancedPrompt || '',
                visualSpec: {
                    perspective: parsed.visualSpec?.perspective || 'ground-level',
                    style: parsed.visualSpec?.style || 'cinematic',
                    subjects: parsed.visualSpec?.subjects || [],
                    action: parsed.visualSpec?.action || '',
                    mood: parsed.visualSpec?.mood || 'neutral',
                    era: parsed.visualSpec?.era,
                    colorPalette: parsed.visualSpec?.colorPalette,
                },
                reasoning: parsed.reasoning || '',
                confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
            };
        } catch (error) {
            console.error('[SceneAnalyzer] Failed to parse response:', responseText.substring(0, 200));
            throw error;
        }
    }

    /**
     * Creates a fallback analysis when LLM fails.
     */
    private createFallbackAnalysis(scene: YouTubeScene): AnalyzedScene {
        // Simple heuristics for fallback
        const hasMotionKeywords = /racing|moving|flowing|drifting|slamming|collision|growing|transform/i.test(scene.visualPrompt);

        return {
            original: scene,
            assetType: hasMotionKeywords ? 'video' : 'image',
            enhancedPrompt: `${scene.visualPrompt}. Cinematic style, high quality, 9:16 vertical format.`,
            visualSpec: {
                perspective: 'ground-level',
                style: 'cinematic',
                subjects: [],
                action: '',
                mood: 'dramatic',
            },
            reasoning: 'Fallback analysis due to LLM failure',
            confidence: 0.3,
        };
    }
}
