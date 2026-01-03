import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';
import { LinkedInPostPayload } from '../src/domain/ports/ILinkedInPosterService';
import { FluxImageClient } from '../src/infrastructure/images/FluxImageClient';

async function postDDDOrchestraWithImage() {
    const linkedinWebhookUrl = 'https://hook.eu2.make.com/aksewbm7gh4md34mfygdn7ssvl8d7p8l';
    const linkedinApiKey = 'yamigopal';

    const beamApiKey = '5y9fLkSWnrT0ERP7GNY4bCpHCOuTj85rzeLnLCkQ6Fl2gFPf-xMvO-0tNaHm2pmyEeSzJ__Rj0Kpmqdpc5H4tw==';
    const beamEndpointUrl = 'https://flux1-image-a614eb3-v11.app.beam.cloud';

    console.log('🎨 Generating image via Flux on Beam.cloud...');
    const fluxClient = new FluxImageClient(beamApiKey, beamEndpointUrl);

    let imageUrl = '';
    try {
        const imageResult = await fluxClient.generateImage(
            "A futuristic high-tech orchestral conductor leading a chorus of robotic agents in a sleek Berlin loft studio. Minimalist architecture, warm neon glows, professional recording gear meets modular synthesizers. Cinematic style."
        );
        imageUrl = imageResult.imageUrl;
        console.log('✅ Image generated:', imageUrl.substring(0, 100) + '...');
    } catch (error) {
        console.error('❌ Failed to generate image, falling back to article post.');
    }

    const content = `The Berlin AI Orchestra: Orchestrating Agents with Domain-Driven Design 🎼🤖

Ever tried to lead a band where every musician speaks a different language, has their own tempo, and occasionally hallucinates a chorus that doesn't exist? Welcome to the early stages of building an Agentic Suite.

I’ve spent the last few weeks transitioning my collection of AI projects into what I now call "The Berlin AI Orchestra" — a symphonic collection of microservices built on the bedrock of Domain-Driven Design (DDD). 

As a musician, I know that if the rhythm section (the database) isn't locked in with the lead melody (the LLM), you don't have music; you have noise. 🎸

Here’s how we applied DDD to make our agents play in perfect harmony:

🌟 The Score: Ubiquitous Language & Bounded Contexts
In music, a "C Major" must mean the same thing to the violinist and the pianist. In my AgentOps Suite, we defined the "Conversation" entity as our master score. By internalizing it within the compliance-engine library, we created a pure Motif. It’s now portable, immutable, and sounds the same in every project. 🎶

🌟 The Sections: Decoupled Microservices
An orchestra is a collection of independent experts. We extracted our core logic into a Master Catalog:
• The Woodwinds (Semantic Aligner): Bridging ontologies with ZK-proven semantic usage.
• The Strings (Fairness Auditor): Real-time bias auditing to keep the performance ethical.
• The Percussion (Deadline Enforcer): SLA monitoring to ensure nobody misses a beat. 🥁
• The Conductor (Capability Broker): Dynamically discovering which agent can take the solo.

🌟 Inversion of Control: Ports & Adapters
Our agents don't care if they are playing in a stadium (Instagram/TikTok) or a jazz club (Local API). By using the Ports & Adapters pattern, we swapped out rendering engines and TTS services without rewriting a single line of domain logic. It's like changing your amplifier but keeping that signature vintage Stratocaster tone. 🎸

Why go through this trouble?
Because scaling AI is a "Hard Problem." Generic wrappers are like one-hit wonders. If you want a long-term residency in the Agentic Economy, you need scalable, auditable, and reusable infrastructure. 

DDD isn't just about code; it's about composing a system that can evolve without the dreaded "Merge Conflict cacophony."

Are you building agents as soloists or as an orchestra? Let’s talk shop in the comments! 🎹👇

#AgenticAI #DomainDrivenDesign #SoftwareArchitecture #BerlinAI #AgentOps #CleanCode #AIInfrastructure #SoftwareEngineering #DDD #BerlinAgentOrchestra #SystemsDesign`;

    const posterService = new WebhookLinkedInPosterService(linkedinWebhookUrl, linkedinApiKey);

    const payload: LinkedInPostPayload = {
        type: imageUrl ? 'IMAGE' : 'ARTICLE',
        content: content,
        visibility: 'PUBLIC' as const,
        media: {
            originalUrl: imageUrl || 'https://github.com/yogami/convo-guard-ai',
            title: 'The Berlin AI Orchestra',
            description: 'Achieving pure microservice independence through DDD patterns.',
        }
    };

    try {
        console.log(`🚀 Posting "The Berlin AI Orchestra" to LinkedIn (${imageUrl ? 'with image' : 'as article'})...`);
        const result = await posterService.postToLinkedIn(payload);

        if (result.success) {
            console.log('✅ Success! Post sent to Make.com.');
        } else {
            console.error('❌ Failed to send post.');
            console.error('Error:', result.error);
        }
    } catch (error) {
        console.error('💥 An unexpected error occurred:');
        console.error(error);
    }
}

postDDDOrchestraWithImage();
