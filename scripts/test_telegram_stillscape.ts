import dotenv from 'dotenv';
import { JobManager } from '../src/application/JobManager';
import { ReelOrchestrator } from '../src/application/ReelOrchestrator';
import { GeminiLlmClient } from '../src/infrastructure/llm/GeminiLlmClient';
import { getConfig } from '../src/config';

dotenv.config();

async function main() {
    console.log("Testing Telegram -> Stillscape Integration...");
    const config = getConfig();

    const jobManager = new JobManager();
    // Mock LLM Client to bypass quota issues for testing the orchestration
    const mockLlmClient = {
        generateText: async (prompt: string) => {
            console.log("Mock LLM received prompt of length:", prompt.length);
            return JSON.stringify({
                caption: "The machine consumes itself. #philosophy #truths",
                acts: [
                    { id: "act1", narration: "The modern world is obsessed with productivity.", visualPrompt: "A giant clockwork machine crushing a flower", typography: [{text: "OBSESSED", color: "yellow"}] },
                    { id: "act2", narration: "We measure our worth by how much we produce,", visualPrompt: "Rows of faceless workers typing blindly", typography: [{text: "PRODUCE", color: "white"}] },
                    { id: "act3", narration: "how many tickets we close, how much money we make.", visualPrompt: "A mountain of burning money", typography: [{text: "MONEY", color: "yellow"}] },
                    { id: "act4", narration: "We have forgotten how to simply exist.", visualPrompt: "A quiet clearing in a misty forest", typography: [{text: "FORGOTTEN", color: "white"}] },
                    { id: "act5", narration: "The machine will inevitably consume itself.", visualPrompt: "A rusty robot devouring its own gears", typography: [{text: "CONSUME", color: "yellow"}] }
                ]
            });
        }
    };

    // We pass dummy dependencies for the ones not used by the Stillscape pipeline
    const orchestrator = new ReelOrchestrator({
        transcriptionClient: {} as any,
        llmClient: mockLlmClient as any,
        ttsClient: {} as any,
        fallbackImageClient: {} as any,
        subtitlesClient: {} as any,
        videoRenderer: {} as any,
        musicSelector: {} as any,
        jobManager: jobManager
    });

    const job = await jobManager.createJob({
        transcript: "The modern world is obsessed with productivity. We measure our worth by how much we produce, how many tickets we close, how much money we make. We have forgotten how to simply exist.",
        targetDurationRange: { min: 10, max: 90 },
        description: "use this exact phrasing: The modern world is obsessed with productivity. We measure our worth by how much we produce, how many tickets we close, how much money we make. We have forgotten how to simply exist. The machine will inevitably consume itself."
    });

    console.log(`Created Job ID: ${job.id}`);
    
    // Process job through Orchestrator
    const completedJob = await orchestrator.processJob(job.id);
    console.log("✅ Job Completed. Final Video URL:", completedJob.finalVideoUrl);
}

main().catch(console.error);
