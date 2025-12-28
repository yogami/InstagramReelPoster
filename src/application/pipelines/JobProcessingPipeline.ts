
import { PipelineStep } from './PipelineInfrastructure';
import { OrchestratorDependencies } from '../ReelOrchestrator';
import { TranscriptionStep } from './steps/TranscriptionStep';
import { InstructionExtractionStep } from './steps/InstructionExtractionStep';
import { IntentDetectionStep } from './steps/IntentDetectionStep';
import { ContentModeStep } from './steps/ContentModeStep';
import { PlanningStep } from './steps/PlanningStep';
import { CommentaryStep } from './steps/CommentaryStep';
import { VoiceoverStep } from './steps/VoiceoverStep';
import { MusicStep } from './steps/MusicStep';
import { ImageStep } from './steps/ImageStep';
import { RenderStep } from './steps/RenderStep';
import { SubtitlesStep } from './steps/SubtitlesStep';
import { AnimatedVideoStep } from './steps/AnimatedVideoStep';

import { VoiceoverService } from '../services/VoiceoverService';
import { ImageGenerationService } from '../services/ImageGenerationService';

// Dependencies needed for pipeline creation
export interface PipelineDependencies extends OrchestratorDependencies {
    voiceoverService: VoiceoverService;
    imageGenerationService: ImageGenerationService;
}

export function createStandardPipeline(deps: PipelineDependencies): PipelineStep[] {
    const steps: PipelineStep[] = [];

    // 1. Transcription
    steps.push(new TranscriptionStep(deps.transcriptionClient, deps.jobManager));

    // 1.5 Instruction Extraction (Handle verbatim requests)
    steps.push(new InstructionExtractionStep(deps.jobManager));

    // 2. Intent Detection
    steps.push(new IntentDetectionStep(deps.llmClient, deps.jobManager));

    // 3. Content Mode
    steps.push(new ContentModeStep(deps.llmClient, deps.jobManager));

    // 4. Planning
    steps.push(new PlanningStep(deps.llmClient, deps.jobManager));

    // 5. Commentary
    steps.push(new CommentaryStep(deps.llmClient, deps.jobManager));

    // 6. Voiceover
    steps.push(new VoiceoverStep(deps.voiceoverService, deps.jobManager));

    // 7. Music
    steps.push(new MusicStep(deps.musicSelector, deps.jobManager));

    // 8. Images
    steps.push(new ImageStep(deps.imageGenerationService, deps.jobManager));

    // 8.5 Animated Video
    if (deps.animatedVideoClient) {
        steps.push(new AnimatedVideoStep(deps.animatedVideoClient, deps.jobManager, deps.storageClient));
    }

    // 9. Subtitles (New step)
    steps.push(new SubtitlesStep(deps.subtitlesClient, deps.jobManager));

    // 10. Render
    steps.push(new RenderStep(deps.videoRenderer, deps.jobManager));

    return steps;
}
