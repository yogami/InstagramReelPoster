import { WebsiteAnalysis, BusinessCategory, PromoScriptPlan, PromoSceneContent } from '../domain/entities/WebsitePromo';
import { IScrapingPort, ScrapingOptions } from '../ports/IScrapingPort';
import { IScriptGenerationPort, ScriptGenerationOptions } from '../ports/IScriptGenerationPort';
import { IAssetGenerationPort, VoiceoverResult } from '../ports/IAssetGenerationPort';
import { IRenderingPort, RenderingAssets, RenderingResult } from '../ports/IRenderingPort';
import { IAvatarGenerationPort, AvatarConfig, AvatarVideoResult, AvailableAvatar } from '../ports/IAvatarGenerationPort';
import { ITranslationPort, SupportedLanguage, TranslationResult } from '../ports/ITranslationPort';

/**
 * Enterprise Stress Test Mock Suite
 * 
 * Provides high-speed, 0-cost mock implementations for E2E stress testing.
 * Use this to verify BullMQ throughput and Orchestrator logic without consuming API credits.
 */

export class StressTestScraperMock implements IScrapingPort {
    async scrape(options: ScrapingOptions): Promise<WebsiteAnalysis> {
        await new Promise(r => setTimeout(r, 100));
        return {
            heroText: 'Stress Test Hero',
            metaDescription: `A simulated company for high-volume testing of ${options.url}`,
            keywords: ['High Performance', 'Scalability', 'Reliability'],
            sourceUrl: options.url,
            detectedBusinessName: 'Stress Test Co',
            siteType: 'business'
        };
    }
}

export class StressTestScriptMock implements IScriptGenerationPort {
    async detectCategory(): Promise<BusinessCategory> {
        await new Promise(r => setTimeout(r, 100));
        return 'tech';
    }
    async generateScript(options: ScriptGenerationOptions): Promise<PromoScriptPlan> {
        await new Promise(r => setTimeout(r, 100));
        return {
            businessName: 'Stress Test Co',
            category: options.category,
            language: options.language,
            coreMessage: 'Scale without limits',
            scenes: [
                { role: 'hook', narration: 'This is a simulation.', subtitle: 'SIMULATION START', duration: 5, imagePrompt: 'Blue neon server racks' },
                { role: 'cta', narration: 'Testing high volume.', subtitle: 'THROUGHPUT TEST', duration: 5, imagePrompt: 'Abstract data flow' }
            ],
            musicStyle: 'techno',
            caption: 'Stress test successful #scale #tech',
            compliance: {
                source: 'public-website',
                consent: true,
                scrapedAt: new Date()
            }
        };
    }
}

export class StressTestAssetMock implements IAssetGenerationPort {
    async generateVoiceover(): Promise<VoiceoverResult> {
        await new Promise(r => setTimeout(r, 100));
        return { url: 'https://mock.assets/silent_voice.mp3', durationSeconds: 10 };
    }
    async generateImages(scenes: PromoSceneContent[]): Promise<string[]> {
        await new Promise(r => setTimeout(r, 100));
        return scenes.map(() => 'https://mock.assets/placeholder.png');
    }
    async selectMusic(): Promise<{ url: string; durationSeconds: number }> {
        await new Promise(r => setTimeout(r, 100));
        return { url: 'https://mock.assets/bg_music.mp3', durationSeconds: 60 };
    }
    async generateSubtitles(): Promise<string> {
        await new Promise(r => setTimeout(r, 100));
        return 'https://mock.assets/subs.srt';
    }
}

export class StressTestRenderingMock implements IRenderingPort {
    async render(): Promise<RenderingResult> {
        await new Promise(r => setTimeout(r, 100));
        return { videoUrl: 'https://mock.assets/delivered_video.mp4', durationSeconds: 10, renderId: 'stress-123' };
    }
}

export class StressTestAvatarMock implements IAvatarGenerationPort {
    async generateAvatarVideo(): Promise<AvatarVideoResult> {
        await new Promise(r => setTimeout(r, 100));
        return { videoUrl: 'https://mock.assets/avatar.mp4', durationSeconds: 10, renderId: 'stress-av-123' };
    }
    async listAvatars(): Promise<AvailableAvatar[]> { return []; }
    async healthCheck(): Promise<boolean> { return true; }
}

export class StressTestTranslationMock implements ITranslationPort {
    async translate(text: string): Promise<TranslationResult> {
        await new Promise(r => setTimeout(r, 100));
        return { translatedText: `[STRESS-TEST] ${text}` };
    }
    async translateBatch(texts: string[]): Promise<TranslationResult[]> {
        await new Promise(r => setTimeout(r, 100));
        return texts.map(t => ({ translatedText: `[STRESS-TEST] ${t}` }));
    }
}
