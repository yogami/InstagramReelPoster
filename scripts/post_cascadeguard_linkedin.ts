
import dotenv from 'dotenv';
import path from 'path';
import { WebhookLinkedInPosterService } from '../src/infrastructure/linkedin/WebhookLinkedInPosterService';

dotenv.config();

const LINKEDIN_WEBHOOK_URL = process.env.LINKEDIN_WEBHOOK_URL || '';
const LINKEDIN_WEBHOOK_API_KEY = process.env.LINKEDIN_WEBHOOK_API_KEY || '';

const ENGLISH_VIDEO_URL = 'https://res.cloudinary.com/djol0rpn5/video/upload/v1769635539/pitch_videos/cascadeguard_linkedin_pitch_mobile_square.mp4';
const GERMAN_VIDEO_URL = 'https://res.cloudinary.com/djol0rpn5/video/upload/v1769636014/pitch_videos/cascadeguard_linkedin_pitch_german_mobile.mp4';

async function main() {
    if (!LINKEDIN_WEBHOOK_URL || !LINKEDIN_WEBHOOK_API_KEY) {
        console.error('❌ Missing LinkedIn Webhook credentials in .env');
        process.exit(1);
    }

    const poster = new WebhookLinkedInPosterService(LINKEDIN_WEBHOOK_URL, LINKEDIN_WEBHOOK_API_KEY);

    console.log('🚀 Starting CascadeGuard LinkedIn Launch...');

    // 1. English Post
    console.log('\n🇺🇸 Posting English Version...');
    const englishContent = `Your supply chain is efficient. But is it solvent?

We just audited a Tier 1 Automotive Network using CascadeGuard.
The result? A 33.2% Resilience Score.

Global manufacturing has a hidden problem: Scale-Free Fragility.
You have optimized for flow, but you have accidentally engineered critical chokepoints.

When we took the "Digital Twin" offline—effectively simulating a Tier 2 supplier shock—flow dropped by 62% instantly.

It’s time to stop optimizing for pennies and start optimizing for survival.
Our Topological Risk Engine doesn't just find the break; it mathematically restructures the mesh to restore resilience to 88%.

The Challenge:
Upload your topology. If you beat our Digital Twin, you are safe.
If not? We need to talk.

DM me "PILOT" to request access to the Flow Sentinel.

#SupplyChainRisk #Resilience #Automotive #Manufacturing #AI #DigitalTwin #Logistics #RiskManagement #CascadeGuard`;

    try {
        const enResult = await poster.postToLinkedIn({
            content: englishContent,
            originalUrl: ENGLISH_VIDEO_URL,
            title: 'CascadeGuard: Scale-Free Fragility Audit',
            altText: 'CascadeGuard Dashboard showing Scale-Free Fragility'
        });

        if (enResult.success) {
            console.log('✅ English Post Successful!');
        } else {
            console.error('❌ English Post Failed:', enResult.error);
        }
    } catch (e: any) {
        console.error('❌ English Post Exception:', e.message);
    }

    // 2. German Post
    console.log('\n🇩🇪 Posting German Version...');
    const germanContent = `Ist Ihre Lieferkette mathematisch solvent oder ein Kartenhaus?

Wir haben ein Tier-1-Automobilnetzwerk mit CascadeGuard auditiert.
Das Ergebnis? Ein Resilienz-Score von nur 33,2 %.

Die deutsche Industrie hat ein unsichtbares Problem: Skalenfreie Fragilität.
Wir haben Jahrzehnte damit verbracht, für Effizienz zu optimieren. Dabei haben wir kritische, versteckte Engpässe geschaffen.

Unser "Flow Sentinel" simulierte einen einzigen Ausfall.
Das Ergebnis: Ein Einbruch des Warenflusses um 62 %.

Es reicht nicht mehr, nur den Bruch zu finden. Wir müssen das Netz reparieren.
Unsere topologische Risiko-Engine strukturiert Ihre Verbindungen mathematisch neu – und stellt 88 % Resilienz wieder her.

Die Challenge:
Laden Sie Ihre Topologie hoch. Wenn Sie unseren Digitalen Zwilling schlagen, sind Sie sicher.
Wenn nicht... müssen wir reden.

Senden Sie mir eine Nachricht mit "PILOT" für exklusiven Zugang.

#Lieferkette #Logistik #Industrie40 #RiskManagement #Resilienz #Automobilindustrie #KI #DigitalTwin #SupplyChainFinance #CascadeGuard`;

    try {
        const deResult = await poster.postToLinkedIn({
            content: germanContent,
            originalUrl: GERMAN_VIDEO_URL,
            title: 'CascadeGuard: Skalenfreie Fragilität Audit',
            altText: 'CascadeGuard Dashboard zeigt Skalenfreie Fragilität'
        });

        if (deResult.success) {
            console.log('✅ German Post Successful!');
        } else {
            console.error('❌ German Post Failed:', deResult.error);
        }
    } catch (e: any) {
        console.error('❌ German Post Exception:', e.message);
    }
}

main();
