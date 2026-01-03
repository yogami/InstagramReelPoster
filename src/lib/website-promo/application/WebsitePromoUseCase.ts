/**
 * Website Promo Use Case
 * 
 * Core application logic that coordinates the promo generation workflow.
 * Uses ports for all external interactions, ensuring testability and independence.
 */

import { WebsitePromoInput, WebsiteAnalysis, PromoScriptPlan, BusinessCategory } from '../domain/entities/WebsitePromo';
import { PromoBlueprint } from '../domain/entities/PromoBlueprint';
import { BlueprintFactory } from '../domain/services/BlueprintFactory';
import { ContentDNAAnalyzer, SiteDNA } from '../domain/services/ContentDNAAnalyzer';
import { resolveVoiceId, VoiceStyle } from '../domain/services/VoiceStyles';
import { IScrapingPort } from '../ports/IScrapingPort';
import { IScriptGenerationPort } from '../ports/IScriptGenerationPort';
import { IAssetGenerationPort } from '../ports/IAssetGenerationPort';
import { IRenderingPort, RenderingResult } from '../ports/IRenderingPort';
import { ITranslationPort } from '../ports/ITranslationPort';
import { ITemplateRepository } from '../ports/ITemplateRepository';
import { ICachePort, CACHE_PREFIXES, DEFAULT_TTL } from '../ports/ICachePort';
import { IMetricsPort, METRICS } from '../ports/IMetricsPort';
import { IAvatarGenerationPort } from '../ports/IAvatarGenerationPort';
import { ICompliancePort } from '../ports/ICompliancePort';

export interface WebsitePromoResult {
    videoUrl: string;
    caption: string;
    businessName: string;
    category: BusinessCategory;
    durationSeconds: number;
    /** Extracted Content DNA (pain points, trust signals, urgency) */
    siteDNA: SiteDNA;
    /** Metadata about the generation process */
    metadata: {
        cached: boolean;
        translated: boolean;
        templateUsed?: string;
        compliance?: {
            approved: boolean;
            score: number;
            auditId: string;
            riskLevel: string;
        };
        provenanceId?: string;
    };
}

export interface WebsitePromoUseCaseDeps {
    scrapingPort: IScrapingPort;
    scriptPort: IScriptGenerationPort;
    assetPort: IAssetGenerationPort;
    renderingPort: IRenderingPort;
    translationPort: ITranslationPort;
    templateRepository: ITemplateRepository;
    cachePort: ICachePort;
    metricsPort: IMetricsPort;
    compliancePort: ICompliancePort;
    avatarPort?: IAvatarGenerationPort;
}

export class WebsitePromoUseCase {
    private readonly blueprintFactory = new BlueprintFactory();
    private readonly dnaAnalyzer = new ContentDNAAnalyzer();

    constructor(private readonly deps: WebsitePromoUseCaseDeps) { }

    /**
     * Executes the full website-to-video promo generation workflow.
     */
    async execute(input: WebsitePromoInput): Promise<WebsitePromoResult> {
        const stopTimer = this.deps.metricsPort.startTimer(METRICS.TOTAL_JOB_DURATION);
        this.deps.metricsPort.incrementCounter(METRICS.JOBS_PROCESSED);

        try {
            // 1. Caching & Scraping
            const cacheKey = `${CACHE_PREFIXES.SCRAPED_WEBSITE}${input.websiteUrl}`;
            let analysis = await this.deps.cachePort.get<WebsiteAnalysis>(cacheKey);
            let isCached = !!analysis;

            if (!analysis) {
                this.deps.metricsPort.incrementCounter(METRICS.CACHE_MISSES, { type: 'scrape' });
                analysis = await this.deps.scrapingPort.scrape({
                    url: input.websiteUrl,
                    deepScrape: true
                });
                await this.deps.cachePort.set(cacheKey, analysis, DEFAULT_TTL.SCRAPED_WEBSITE);
            } else {
                this.deps.metricsPort.incrementCounter(METRICS.CACHE_HITS, { type: 'scrape' });
            }

            // 1b. Analyze Content DNA
            const siteDNA = this.dnaAnalyzer.analyzeDNA(analysis);
            console.log(`[PromoSlice] Content DNA: pain=${siteDNA.painScore}, trust=${siteDNA.trustSignals.length}, urgency=${siteDNA.urgency ? 'yes' : 'no'}`);

            // 2. Detect category
            const category = input.category || await this.deps.scriptPort.detectCategory(analysis);

            // 3. Template Selection or Generation
            let script: PromoScriptPlan;
            const scriptOptions = {
                websiteAnalysis: analysis,
                category,
                language: input.language || 'en',
                targetDurationSeconds: 17, // Standard reel length
                formality: input.formality,
                tone: input.tone
            };

            if (input.templateId) {
                const template = await this.deps.templateRepository.getTemplate(input.templateId);
                if (template) {
                    script = await this.deps.scriptPort.generateScript(scriptOptions);
                    script.musicStyle = template.musicStyle;
                    script.templateId = input.templateId;
                    script.scenes.forEach((scene, i) => {
                        if (template.sceneHints[i]) {
                            scene.duration = template.sceneHints[i].durationSeconds;
                        }
                    });
                } else {
                    script = await this.deps.scriptPort.generateScript(scriptOptions);
                }
            } else {
                script = await this.deps.scriptPort.generateScript(scriptOptions);
            }

            // 4. Multilingual Translation
            let isTranslated = false;
            const targetLang = (input.language || 'en').toUpperCase();
            if (targetLang !== 'EN') {
                isTranslated = true;
                this.deps.metricsPort.incrementCounter(METRICS.TRANSLATIONS_PERFORMED);

                // Translate narration and subtitles for each scene
                const scenesToTranslate = script.scenes.map(s => `${s.narration}|||${s.subtitle}`);
                const translations = await this.deps.translationPort.translateBatch(scenesToTranslate, targetLang as any);

                script.scenes.forEach((scene, i) => {
                    const parts = translations[i].translatedText.split('|||');
                    scene.narration = parts[0];
                    scene.subtitle = parts[1] || parts[0];
                });

                // Translate core message and caption
                const miscTranslations = await this.deps.translationPort.translateBatch([script.coreMessage, script.caption], targetLang as any);
                script.coreMessage = miscTranslations[0].translatedText;
                script.caption = miscTranslations[1].translatedText;
                script.language = targetLang;
            }

            // 5. Guardian Compliance Scan (Berlin Specialist MOAT)
            const fullScriptText = script.scenes.map(s => s.narration).join(' ') + ' ' + script.caption;
            const compliance = await this.deps.compliancePort.checkScript({
                text: fullScriptText,
                language: script.language,
                market: input.market || 'global',
                formality: input.formality
            });

            if (!compliance.approved && compliance.riskLevel === 'high') {
                console.warn(`[PromoSlice] Blocked by Guardian: ${compliance.violations.join(', ')}`);
                throw new Error(`Compliance Block: ${compliance.violations[0] || 'Content rejected by safety engine'}`);
            }

            // 6. Generate assets with voice style resolution
            const finalVoiceId = resolveVoiceId(input.voiceStyle as VoiceStyle, input.voiceId);

            // Generate images (parallel)
            const imagesPromise = this.deps.assetPort.generateImages(script.scenes);

            // Generate voiceover
            const narration = script.scenes.map(s => s.narration).join(' ');
            const voiceover = await this.deps.assetPort.generateVoiceover(narration, {
                language: script.language,
                voiceId: finalVoiceId
            });

            const images = await imagesPromise;
            const music = await this.deps.assetPort.selectMusic(category, voiceover.durationSeconds);
            const subtitles = await this.deps.assetPort.generateSubtitles(voiceover.url);

            // 7. Optional Avatar Integration
            let avatarVideoUrl: string | undefined;
            if (input.avatarId && this.deps.avatarPort) {
                console.log(`[PromoSlice] Generating optimized avatar video...`);
                const avatarResult = await this.deps.avatarPort.generateAvatarVideo(
                    script.scenes[0].narration,
                    {
                        avatarId: input.avatarId,
                        voiceId: finalVoiceId,
                        resolution: '1080p',
                        preRenderedBaseUrl: this.resolvePreRenderedBase(input.avatarId)
                    },
                    voiceover.url
                );
                avatarVideoUrl = avatarResult.videoUrl;
            }

            // 8. Render video
            const renderResult = await this.deps.renderingPort.render(
                {
                    ...script,
                    motionStyle: input.motionStyle || 'ken_burns',
                    subtitleStyle: input.subtitleStyle || 'bold'
                },
                {
                    voiceoverUrl: voiceover.url,
                    musicUrl: music.url,
                    subtitlesUrl: subtitles,
                    imageUrls: images,
                    logoUrl: input.logoUrl,
                    avatarVideoUrl
                }
            );

            // 9. Record Asset Provenance (Audit Trail)
            const jobId = `job_${Date.now()}`;
            const provenanceId = await this.deps.compliancePort.recordProvenance(jobId, {
                approved: compliance.approved,
                score: compliance.score,
                auditId: compliance.auditId,
                music: { trackName: 'Promo Music', source: 'catalog', license: 'Royalty-Free' },
                images: images.map((url, i) => ({ sceneIndex: i, source: 'flux', synthetic: true, license: 'AI-Generated' })),
                voice: { provider: 'fish_audio', voiceId: finalVoiceId, synthetic: true, language: script.language }
            });

            stopTimer();
            return {
                videoUrl: renderResult.videoUrl,
                caption: script.caption,
                businessName: script.businessName,
                category: script.category,
                durationSeconds: renderResult.durationSeconds,
                siteDNA,
                metadata: {
                    cached: isCached,
                    translated: isTranslated,
                    templateUsed: input.templateId,
                    compliance: {
                        approved: compliance.approved,
                        score: compliance.score,
                        auditId: compliance.auditId,
                        riskLevel: compliance.riskLevel
                    },
                    provenanceId
                }
            };
        } catch (error: any) {
            this.deps.metricsPort.incrementCounter(METRICS.JOBS_FAILED);
            throw error;
        }
    }

    private resolvePreRenderedBase(avatarId: string): string | undefined {
        const MAPPING: Record<string, string> = {
            'Imelda_Casual_Front_public': 'https://res.cloudinary.com/demo/video/upload/v1/pre-renders/imelda_casual_base.mp4',
            'Imelda_Suit_Front_public': 'https://res.cloudinary.com/demo/video/upload/v1/pre-renders/imelda_suit_base.mp4'
        };
        return MAPPING[avatarId];
    }
}
