/**
 * GenAI Zurich Award — LLM Judge Panel
 *
 * Sends the original submission, revised submission, and video script
 * to frontier LLMs via OpenRouter, role-playing as award adjudicators.
 *
 * Models used:
 * - Google Gemini 2.0 Flash Thinking (latest reasoning)
 * - Anthropic Claude 3.5 Sonnet (balanced critique)
 * - DeepSeek R1 (reasoning/technical depth)
 * - Perplexity Sonar Pro (search-grounded critique)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
const fs = require('fs');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const PERPLEXITY_API_KEY = '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';
const OUTPUT_DIR = path.resolve(__dirname, '../judge_panel_results');

const JUDGES = [
    { name: 'Gemini 2.0 Flash Thinking', model: 'google/gemini-2.0-flash-thinking-exp:free', api: 'openrouter' },
    { name: 'Claude 3.5 Sonnet', model: 'anthropic/claude-3.5-sonnet', api: 'openrouter' },
    { name: 'DeepSeek R1', model: 'deepseek/deepseek-r1', api: 'openrouter' },
    { name: 'Perplexity Sonar Pro', model: 'sonar-pro', api: 'perplexity' },
];

// ── AWARD CRITERIA ──
const AWARD_CRITERIA = `
GenAI Zürich Award 2026 — "Rising Innovators" Track
=====================================================

Eligibility: Startups and scale-ups building GenAI products, tooling, or infrastructure.

Evaluation Criteria (scored 1-10 each, with weighting):

1. INNOVATION (35%): Originality and groundbreaking nature of the solution. Does it leverage new AI models, architectures, or methods? Does it create business value or tangible societal benefit with clear metrics?

2. IMPACT (35%): Demonstrated or potential impact. Ability to advance sustainability and deliver meaningful societal benefits. Quantifiable results (revenue, social benefit).

3. SCALABILITY & SUSTAINABILITY (10%): How well can it be maintained and improved? Potential for replication or expansion into different markets or user groups.

4. ETHICAL & RESPONSIBLE AI (10%): Are potential biases identified and mitigated? Does the project comply with privacy regulations and ensure responsible data usage?

5. PRODUCTION READINESS (10%): Stage from concept to proven production deployment. Is it being used by real users or stakeholders, and for how long?

Submission Requirements:
- Single A4 page document (legible when printed)
- Video: maximum 3 minutes, downloadable
- Motivation statement: why applying, what success looks like
- Links to supporting materials
`;

// ── ORIGINAL SUBMISSION (Jan 10, 2026) ──
const ORIGINAL_SUBMISSION = `
ORIGINAL SUBMISSION — January 10, 2026
========================================

Product: Agent Ops Mission Control
Product URL: https://agent-ops-mission-control-production.up.railway.app

"Why Applying" text:
Agent Ops Mission Control is the operational backbone that enables enterprises to achieve Agile Analytics at Scale by removing the critical bottleneck of manual compliance and safety verification.

Key claims:
- Instant Validation: Real-time neural inference (ConvoGuard) checks every interaction against GDPR, DiGA, and BaFin standards in milliseconds
- Scalable Autonomy: "Ralph Wiggum" persistence engine for agent auto-correction
- Immutable Trust: Cryptographically signed and anchored audit trail
- Vendor Neutral: One policy engine for OpenAI, Anthropic, Azure, and local models
- 100% of critical failures blocked at runtime
- Review times cut from weeks to milliseconds
- Architected for 10,000+ concurrent agents

Video: 3-minute pitch showing the platform dashboard, agent discovery, ZK proofs, kanban management, kill switch, and compliance features.
`;

// ── REVISED SUBMISSION (Feb 9, 2026) ──
const REVISED_SUBMISSION = `
REVISED SUBMISSION — February 9, 2026
=======================================

Product: Agent Ops Mission Control
Product URL: https://agent-ops-mission-control-production.up.railway.app/gdpr

"Why Applying" text (revised):
I applied for the GenAI Zürich Award because Mission Control has evolved from a GDPR compliance dashboard into Europe's first working implementation of the Cloud Security Alliance's Agentic Trust Framework (ATF). While others have published specifications with zero working code, I have shipped 12 deployed microservices with 15,000+ lines of TypeScript and 100+ automated tests, all live on Railway.

Since my initial submission, I have shipped major updates. GDPR Article Coverage now spans 8 articles (Art 6, 9, 13/14, 17, 22, 25, 30, 35) with ConvoGuard benchmarks quantified at 100% crisis recall (F1: 0.97, n=312), 96% consent detection precision (F1: 0.94, n=847), and 8ms median ONNX latency. I added a public transparency page disclosing known limitations, a machine-readable benchmarks API at /api/gdpr/benchmarks, and integration exports for REST API, Webhooks, BfArM XML, SIEM (Splunk/Datadog), and PDF Audit.

More importantly, Mission Control now serves as the operator dashboard for a full ATF-compliant agent governance stack covering all five trust elements: Identity (DID-based verification and reputation scoring), Behavior (Ed25519 cryptographic Proof of Execution anchored to Solana), Data Governance (sub-20ms ONNX inference firewall with EU AI Act compliance), Segmentation (policy-as-code resource ACLs with blast radius containment), and Incident Response (circuit breakers, kill switches, and 41-vector automated adversarial testing via agent-pentest on npm). The stack includes a 4-level maturity model (Intern to Principal) with 5 automated promotion gates.

Rising Innovators is the right track because this is not a specification or a whitepaper. This is production code solving the trust problem that every enterprise deploying autonomous agents in Europe will face when the EU AI Act enforcement begins August 2026. Zürich recognition validates that Europe can lead on agentic governance with deployed infrastructure, not just published frameworks.

Validation text (revised):
I demoed at CIC Berlin and received feedback from HelloBetter's founder. GDPR benchmarks are publicly verifiable at /api/gdpr/benchmarks. The ATF reference implementation is open source at github.com/yogami/atf-reference-implementation with automated contract validation tests. Integration exports (REST, Webhooks, BfArM XML, SIEM, PDF) are live and tested.
`;

// ── VIDEO SCRIPT (v10 — 8 segments) ──
const VIDEO_SCRIPT = `
VIDEO SCRIPT — v10 (8 segments, target ≤ 180 seconds)
======================================================

Segment 1 (Mission Control homepage):
"The EU AI Act takes effect August 2026. Mental health chatbots are classified as high-risk AI systems. Enterprises deploying AI agents in Europe need runtime governance — not just monitoring, not just logs, but enforcement. This is what we built."

Segment 2 (GDPR Compliance Center):
"Mission Control started as a GDPR compliance dashboard. We enforce 8 GDPR articles with working code, covering Lawful Processing, Special Categories, Automated Decision-Making, and Transparency. Each article maps to a real microservice, and our fleet compliance matrix tracks every agent in real-time."

Segment 3 (ConvoGuard benchmarks + transparency):
"Behind the compliance layer is ConvoGuard — a local ONNX inference firewall running at 8 milliseconds median latency. It detects crisis signals with 100% recall, and consent patterns with 96% precision. No data leaves the device. We also publicly disclose every known limitation on a transparency page."

Segment 4 (Fast Audit / BfArM):
"For German regulatory compliance, our Fast Audit tool validates any AI transcript against BfArM and EU AI Act standards. Paste a conversation, get a compliance report, and download BfArM-ready XML in seconds."

Segment 5 (Trust Protocol landing page):
"But GDPR compliance is only one piece. We evolved Mission Control into Europe's first working implementation of the Cloud Security Alliance's Agentic Trust Framework — covering all five trust elements: Identity, Behavior, Data Governance, Segmentation, and Incident Response."

Segment 6 (Trust Protocol directory):
"Our Trust Protocol provides a reputation registry for AI agents. Every agent gets a cryptographically verified TrustScore based on compliance, uptime, and behavioral audits. Organizations can discover, verify, and govern their entire autonomous workforce."

Segment 7 (npm agent-pentest):
"We also built a 4-level agent maturity model — Intern, Junior, Senior, Principal — with 5 automated promotion gates. When agents go rogue, circuit breakers and kill switches provide instant containment. Our open-source agent-pentest CLI on npm runs 41 adversarial attack vectors against any agent endpoint."

Segment 8 (Mission Control CTA):
"12 deployed microservices. 15,000 lines of TypeScript. 459 automated tests. Everything open source and live on Railway. This is not a whitepaper. This is production infrastructure for Europe's AI future. We are Berlin AI Labs."
`;

const JUDGE_PROMPT = `You are an independent adjudicator for the GenAI Zürich Award 2026, "Rising Innovators" track. You are evaluating a submission from Berlin AI Labs for their product "Agent Ops Mission Control."

Your job is to provide harsh, honest, and constructive feedback. You are NOT the applicant's friend. You are a Swiss innovation judge who has seen hundreds of AI submissions and can instantly spot hand-waving, toy-grade demos, and buzzword padding.

Here are the evaluation criteria:

${AWARD_CRITERIA}

Here is what was originally submitted on January 10, 2026:

${ORIGINAL_SUBMISSION}

Here is the REVISED submission being sent on February 9, 2026:

${REVISED_SUBMISSION}

Here is the script for the updated 3-minute video:

${VIDEO_SCRIPT}

Please provide your evaluation in the following structure:

## 1. COMPREHENSION TEST
- In YOUR OWN WORDS, explain what problem this product solves and how it solves it.
- If you are confused about ANYTHING, state exactly what is unclear.
- Does the submission tell a coherent story, or does it feel fragmented?

## 2. SCORECARD
Rate each criterion 1-10 with brief justification:
- Innovation (35%): 
- Impact (35%): 
- Scalability & Sustainability (10%): 
- Ethical & Responsible AI (10%): 
- Production Readiness (10%): 
- **WEIGHTED TOTAL**: (calculated)

## 3. RED FLAGS
What would make a judge dismiss this submission? Be brutal. Flag any:
- Buzzwords without substance
- Claims that can't be independently verified
- Confusing terminology or acronyms
- Narrative inconsistencies between original and revised submission
- Video script issues (pacing, clarity, flow)

## 4. TOP 3 IMPROVEMENTS
If you could change exactly 3 things to maximize the score, what would they be? Be specific — give exact rewrites where possible.

## 5. VIDEO SCRIPT VERDICT
- Is the 8-segment narrative arc clear to a NON-TECHNICAL judge?
- Does the video tell a story or just list features?
- What is the emotional arc? Is there one?
- Specific line-by-line feedback on the video script.
`;

async function queryJudge(judge) {
    console.log(`\n🎓 Querying Judge: ${judge.name} (${judge.model} via ${judge.api})...`);
    const startTime = Date.now();

    try {
        let apiUrl, headers, body;

        if (judge.api === 'perplexity') {
            apiUrl = 'https://api.perplexity.ai/chat/completions';
            headers = {
                'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
                'Content-Type': 'application/json'
            };
            body = {
                model: judge.model,
                messages: [{ role: 'user', content: JUDGE_PROMPT }],
                max_tokens: 4000,
                temperature: 0.7
            };
        } else {
            apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
            headers = {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://berlin-ai-labs.de',
                'X-Title': 'Zurich GenAI Award Judge Panel'
            };
            body = {
                model: judge.model,
                messages: [{ role: 'user', content: JUDGE_PROMPT }],
                max_tokens: 4000,
                temperature: 0.7
            };
        }

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorBody}`);
        }

        const data = await response.json();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const content = data.choices?.[0]?.message?.content || 'No response';
        console.log(`  ✅ ${judge.name} responded in ${elapsed}s (${content.length} chars)`);
        return { judge: judge.name, model: judge.model, content, elapsed };
    } catch (err) {
        console.error(`  ❌ ${judge.name} failed:`, err.message);
        return { judge: judge.name, model: judge.model, content: `ERROR: ${err.message}`, elapsed: 0 };
    }
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    console.log('═══════════════════════════════════════════════════');
    console.log('  🏛️  GenAI ZÜRICH AWARD — LLM JUDGE PANEL');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Judges: ${JUDGES.map(j => j.name).join(', ')}`);
    console.log(`  Mode: Independent critique, no coordination`);
    console.log('');

    const results = [];
    for (const judge of JUDGES) {
        const result = await queryJudge(judge);
        results.push(result);

        // Save individual result
        const safeName = judge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
        fs.writeFileSync(
            path.join(OUTPUT_DIR, `${safeName}.md`),
            `# Judge: ${result.judge}\n**Model:** ${result.model}\n**Response time:** ${result.elapsed}s\n\n---\n\n${result.content}`
        );
    }

    // Compile all results into one file
    const compiled = results.map(r =>
        `# 🎓 Judge: ${r.judge}\n**Model:** \`${r.model}\`\n**Response time:** ${r.elapsed}s\n\n---\n\n${r.content}\n\n${'═'.repeat(80)}\n`
    ).join('\n');

    const compiledPath = path.join(OUTPUT_DIR, 'ALL_JUDGES_COMPILED.md');
    fs.writeFileSync(compiledPath, `# GenAI Zürich Award — Judge Panel Results\n\n**Date:** ${new Date().toISOString()}\n**Judges:** ${JUDGES.length}\n\n${'═'.repeat(80)}\n\n${compiled}`);

    console.log('\n═══════════════════════════════════════════════════');
    console.log('  ✅ ALL JUDGES RESPONDED');
    console.log(`  📁 Results: ${OUTPUT_DIR}/`);
    console.log(`  📋 Compiled: ${compiledPath}`);
    console.log('═══════════════════════════════════════════════════\n');
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
