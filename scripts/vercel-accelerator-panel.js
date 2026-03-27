/**
 * Vercel AI Accelerator — Expert Consortium v3 (Working)
 * 4 frontier models concurrently (Claude excluded — we ARE Claude)
 */
const fs = require('fs');
const path = require('path');
const OUTDIR = path.resolve(__dirname, '../vercel_accelerator_panel');
const OR_KEY = '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';
const PPLX_KEY = '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';

const PROMPT = `## VERCEL AI ACCELERATOR PROGRAM
- 6-week program (Mar 2 - Apr 16, 2026), 40 teams globally
- Demo Day in San Francisco (Apr 16) - judges from AWS, Vercel, OpenAI, Cursor, Modal
- First place winner gets investment from Vercel Ventures
- Over $6M in credits: $30k Vercel, $25k AWS, $15k Anthropic, $15k OpenAI, etc.
- They want: "AI agents that operate independently and scale automatically"
- Pre-seed ideas. Judged on: submission quality, founder background, impact + scalability potential
- Must be Vercel customer. Tech is portable (Railway to Vercel trivially). FOCUS ON BUSINESS FIT.
- Previous winners: Stably AI, Cervo, Bear AI, General Translation

## PORTFOLIO (Solo founder, Berlin)

### 1. AICanary - Startup Validation Engine
AI-powered startup intelligence: Canary Score (0-1000), SWOT, Brutal Reality Check, competitor mapping. Uses LLM APIs (OpenAI, Perplexity, AskNews) for real-time market intelligence with anti-hallucination grounding. Target: Founders, VCs, accelerators. Stage: Live demo, no revenue, Next.js.

### 2. Agent Ops Mission Control - AI Agent Governance Platform
Compliance firewall for AI agent fleets: GDPR enforcement (8 articles), 8ms local ONNX inference, 97% crisis detection, 96% consent precision. Agent Trust Protocol and PDP Protocol - built BEFORE CSA published their ATF spec. agent-pentest CLI on npm with 41 adversarial attack vectors. Target: Regulated enterprises (healthcare, finance, insurance). Stage: 12 microservices live, CIC Berlin demo, HelloBetter founder feedback, no revenue. Next.js.

### 3. ConvoGuard AI - Firewall for the Agentic Era
Standalone AI compliance middleware. Sub-20ms local ONNX inference, no cloud dependency. Could be SaaS for any AI app needing content safety. Target: Any LLM deployer. Stage: Part of Mission Control, could be standalone.

### 4. Microcatchment Pro - Stormwater Intake Field OS
Engineering-grade stormwater auditing via PINN models. Target: Civil engineers, municipalities. Stage: Working iOS app, no revenue, React Native.

### 5. TwinTap - Decentralized Professional Networking
On-device professional networking with AI matching. Target: Conference attendees. Stage: v2.0, 20 demo profiles, no real users, PWA.

### 6. CascadeGuard - Supply Chain Finance Risk Platform
Cash-flow stress-testing with quantum optimization. Target: CFOs, credit insurers. Stage: POC, no users, React/Vite + FastAPI.

## YOUR TASK
Which ONE project BEST fits the Vercel AI Accelerator? BUSINESS FIT ONLY:
1. Market Timing (why now for Feb-Apr 2026?)
2. Demo Day Impact (WOW judges at SF demo day?)
3. Credit Utilization (which NEEDS $150k+ in AI/cloud credits?)
4. Investor Appeal (Vercel Ventures would invest?)
5. Scalability (clearest pre-seed to Series A path?)
6. Competitive Moat (defensible with scale?)
7. 6-Week Sprint (dramatic visible progress in 6 weeks?)

OUTPUT:
1. RANKING: All 6 projects best to worst (one-line each)
2. WINNER: Your #1 pick with detailed 3-4 paragraph reasoning
3. 6-WEEK PLAN for the winner
4. DEMO DAY PITCH: 60-second pitch for the winner at SF Demo Day`;

const EXPERTS = [
    {
        name: 'GPT-5.2 - Vercel Insider', model: 'openai/gpt-5.2-chat', api: 'or',
        persona: 'You are a senior product manager at Vercel who helped design the AI Accelerator program. You know exactly what makes a winning application: products that showcase the Vercel AI SDK, Next.js, and the Vercel platform ecosystem. You have seen all previous cohort winners and know the judges preferences from AWS, OpenAI, Cursor, and Modal.'
    },
    {
        name: 'Grok 4.1 - Contrarian VC', model: 'x-ai/grok-4.1-fast', api: 'or',
        persona: 'You are a contrarian deep-tech VC based in Berlin who specifically invests in European AI infrastructure. You despise copycats and thin AI wrappers over OpenAI. You only invest in products with genuine technical moats and regulatory advantages. Most AI startups will die because they have no defensible position.'
    },
    {
        name: 'DeepSeek v3.2 - Growth Strategist', model: 'deepseek/deepseek-v3.2', api: 'or',
        persona: 'You are a PLG (product-led growth) strategist who has personally scaled 3 developer tools from zero to $10M ARR. You evaluate products on viral loops, self-serve onboarding friction, developer community potential, and time-to-value. The best accelerator projects are ones developers can try in 30 seconds and share with colleagues.'
    },
    {
        name: 'Perplexity Sonar Pro - Market Analyst', model: 'sonar-pro', api: 'pplx',
        persona: 'You are an AI market analyst with access to real-time market intelligence. You evaluate startups by researching the actual competitive landscape, addressable market size, and recent 2026 funding rounds in their space. Ground all analysis in verifiable facts about the current AI market.'
    }
];

async function query(expert) {
    process.stdout.write(`  ${expert.name}...`);
    const start = Date.now();
    try {
        const url = expert.api === 'pplx'
            ? 'https://api.perplexity.ai/chat/completions'
            : 'https://openrouter.ai/api/v1/chat/completions';
        const key = expert.api === 'pplx' ? PPLX_KEY : OR_KEY;
        const hdrs = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
        if (expert.api === 'or') { hdrs['HTTP-Referer'] = 'https://berlin-ai-labs.de'; }

        const res = await fetch(url, {
            method: 'POST', headers: hdrs, body: JSON.stringify({
                model: expert.model,
                messages: [
                    { role: 'system', content: expert.persona },
                    { role: 'user', content: PROMPT }
                ],
                max_tokens: 3000,
                temperature: 0.7
            })
        });

        const text = await res.text();
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`);

        const data = JSON.parse(text);
        const content = data.choices?.[0]?.message?.content || 'No response';
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(` done (${elapsed}s, ${content.length} chars)`);

        const safeName = expert.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        fs.writeFileSync(path.join(OUTDIR, `${safeName}.md`), `# ${expert.name}\n**Model:** ${expert.model}\n\n---\n\n${content}`);
        return { name: expert.name, content, elapsed, ok: true };
    } catch (err) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(` FAILED (${elapsed}s): ${err.message.substring(0, 100)}`);
        return { name: expert.name, content: `ERROR: ${err.message}`, elapsed, ok: false };
    }
}

async function main() {
    fs.mkdirSync(OUTDIR, { recursive: true });
    console.log('VERCEL AI ACCELERATOR - EXPERT CONSORTIUM v3\n');

    const results = await Promise.all(EXPERTS.map(e => query(e)));

    const successful = results.filter(r => r.ok);
    console.log(`\n${successful.length}/${results.length} experts responded.\n`);

    // Build combined file
    const combined = results.map(r => {
        return `# ${r.name} (${r.elapsed}s)\n\n${r.content}\n\n${'='.repeat(80)}\n`;
    }).join('\n');

    fs.writeFileSync(path.join(OUTDIR, 'CONSORTIUM_DECISION.md'),
        `# Vercel AI Accelerator - Expert Consortium\n**Date:** ${new Date().toISOString()}\n**Models:** ${EXPERTS.map(e => e.model).join(', ')}\n\n---\n\n${combined}`
    );
    console.log('Written to vercel_accelerator_panel/CONSORTIUM_DECISION.md');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
