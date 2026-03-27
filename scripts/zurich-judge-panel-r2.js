/**
 * Judge Panel Round 2 — Google Gemini (native) + Perplexity with different personas
 */
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');

const GOOGLE_AI_KEY = process.env.GOOGLE_AI_API_KEY || 'AIzaSyD-LzS6fE-k99q33bB_V_G9S8T-9zX9kL';
const PERPLEXITY_API_KEY = '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';
const OUTPUT_DIR = path.resolve(__dirname, '../judge_panel_results');

// Reuse the same prompt from the original script
const JUDGE_PROMPT = fs.readFileSync(path.join(OUTPUT_DIR, 'perplexity_sonar_pro.md'), 'utf8')
    .split('---\n\n')[1] || ''; // Extract just the response for reference

// ── Same materials from the main script ──
const AWARD_CRITERIA = `
GenAI Zürich Award 2026 — "Rising Innovators" Track

Evaluation Criteria (scored 1-10 each, with weighting):
1. INNOVATION (35%): Originality, new AI models/architectures/methods, business value/societal benefit with clear metrics.
2. IMPACT (35%): Demonstrated or potential impact, sustainability, quantifiable results.
3. SCALABILITY & SUSTAINABILITY (10%): Maintainability, expansion potential.
4. ETHICAL & RESPONSIBLE AI (10%): Bias mitigation, privacy compliance, responsible data usage.
5. PRODUCTION READINESS (10%): Stage from concept to proven production deployment, real users, duration.

Submission: Single A4 + 3-minute video + motivation statement + supporting links.
`;

const ORIGINAL_SUBMISSION = `ORIGINAL (Jan 10): Agent Ops Mission Control — "operational backbone for Agile Analytics at Scale." Claims: instant validation via ConvoGuard, auto-correcting agents, crypto audit trail, vendor-neutral. Metrics: "100% critical failures blocked, weeks→milliseconds, 10k+ agents."`;

const REVISED_SUBMISSION = `REVISED (Feb 9): Evolved from GDPR dashboard into "Europe's first working ATF implementation." 12 microservices, 15k LoC TypeScript, 100+ tests. GDPR 8 articles enforced, ConvoGuard benchmarks (100% crisis recall F1:0.97 n=312, 96% consent precision F1:0.94 n=847, 8ms ONNX latency). Transparency page + benchmarks API. ATF 5 trust elements: Identity (DID), Behavior (Ed25519/Solana PoE), Data Governance (ONNX firewall), Segmentation (policy-as-code ACLs), Incident Response (circuit breakers, kill switches, agent-pentest 41 vectors on npm). 4-level maturity model. Validation: CIC Berlin demo, HelloBetter feedback, open source ATF ref impl.`;

const VIDEO_SCRIPT = `VIDEO (8 segments, ≤180s):
1. EU AI Act + high-risk classification → need enforcement not just monitoring
2. Mission Control as GDPR dashboard, 8 articles, fleet compliance matrix
3. ConvoGuard ONNX firewall: 8ms, 100% crisis recall, 96% consent precision, transparency page
4. Fast Audit: BfArM XML compliance reports in seconds
5. GDPR → ATF evolution, CSA Agentic Trust Framework, 5 trust elements
6. Trust Protocol: reputation registry, TrustScore, agent directory
7. Maturity model (4 levels), circuit breakers, agent-pentest CLI on npm
8. Stats CTA: 12 microservices, 15k LoC, 459 tests, "not a whitepaper" — Berlin AI Labs`;

const BASE_PROMPT = `You are an independent adjudicator for the GenAI Zürich Award 2026, "Rising Innovators" track. You are evaluating a submission from Berlin AI Labs for "Agent Ops Mission Control."

Your job: harsh, honest, constructive feedback. You have seen hundreds of AI submissions and can spot hand-waving instantly.

${AWARD_CRITERIA}

ORIGINAL SUBMISSION: ${ORIGINAL_SUBMISSION}

REVISED SUBMISSION: ${REVISED_SUBMISSION}

VIDEO SCRIPT: ${VIDEO_SCRIPT}

Please provide:

## 1. COMPREHENSION TEST
In YOUR OWN WORDS, what problem does this solve and how? What is confusing?

## 2. SCORECARD (1-10 each)
- Innovation (35%)
- Impact (35%)
- Scalability & Sustainability (10%)
- Ethical & Responsible AI (10%)
- Production Readiness (10%)
- WEIGHTED TOTAL

## 3. RED FLAGS (be brutal)

## 4. TOP 3 IMPROVEMENTS (be specific, include rewrites)

## 5. VIDEO SCRIPT — is it clear to a non-technical judge? Story or feature list?
`;

const JUDGES = [
    {
        name: 'Gemini 2.0 Flash',
        api: 'google',
        model: 'gemini-2.0-flash',
        persona: '' // Use base prompt
    },
    {
        name: 'Swiss Innovation Judge (Perplexity)',
        api: 'perplexity',
        model: 'sonar-pro',
        persona: 'You specifically focus on market viability and traction. You are a Swiss VC who has invested in 30+ deep tech companies. You care about REVENUE, USERS, and PILOT CONTRACTS — not lines of code or test counts.'
    },
    {
        name: 'EU Regulatory Expert (Perplexity)',
        api: 'perplexity',
        model: 'sonar-pro',
        persona: 'You are a senior EU regulatory affairs consultant specializing in the EU AI Act and GDPR enforcement. You have advised 20+ AI companies on compliance. You focus on whether the REGULATORY CLAIMS are accurate, verifiable, and would withstand scrutiny from actual regulators.'
    }
];

async function queryGemini(prompt) {
    const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GOOGLE_AI_KEY}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.7, maxOutputTokens: 4000 }
            })
        }
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response';
}

async function queryPerplexity(prompt) {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: 'sonar-pro',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 4000,
            temperature: 0.7
        })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log('═══════════════════════════════════════════════════');
    console.log('  🏛️  GenAI ZÜRICH AWARD — JUDGE PANEL ROUND 2');
    console.log('═══════════════════════════════════════════════════\n');

    const results = [];
    for (const judge of JUDGES) {
        console.log(`\n🎓 Querying: ${judge.name}...`);
        const startTime = Date.now();
        const prompt = judge.persona ? `${judge.persona}\n\n${BASE_PROMPT}` : BASE_PROMPT;

        try {
            let content;
            if (judge.api === 'google') {
                content = await queryGemini(prompt);
            } else {
                content = await queryPerplexity(prompt);
            }
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`  ✅ ${judge.name} responded in ${elapsed}s (${content.length} chars)`);
            results.push({ judge: judge.name, content, elapsed });

            const safeName = judge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            fs.writeFileSync(
                path.join(OUTPUT_DIR, `round2_${safeName}.md`),
                `# Judge: ${judge.name}\n**Response time:** ${elapsed}s\n\n---\n\n${content}`
            );
        } catch (err) {
            console.error(`  ❌ ${judge.name} failed:`, err.message);
            results.push({ judge: judge.name, content: `ERROR: ${err.message}`, elapsed: 0 });
        }
    }

    // Compile
    const compiled = results.map(r =>
        `# 🎓 ${r.judge}\n**Response time:** ${r.elapsed}s\n\n---\n\n${r.content}\n\n${'═'.repeat(80)}\n`
    ).join('\n');

    const compiledPath = path.join(OUTPUT_DIR, 'ALL_JUDGES_ROUND2.md');
    fs.writeFileSync(compiledPath, `# Judge Panel Round 2\n**Date:** ${new Date().toISOString()}\n\n${compiled}`);

    console.log(`\n✅ Round 2 compiled → ${compiledPath}\n`);
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
