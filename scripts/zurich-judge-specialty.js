/**
 * Perplexity-only judges — Swiss VC + EU Regulatory Expert
 */
const path = require('path');
const fs = require('fs');
const OUTPUT_DIR = path.resolve(__dirname, '../judge_panel_results');
const PPLX_KEY = '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';

const CONTEXT = `
GenAI Zürich Award 2026 — "Rising Innovators" Track
Evaluation: Innovation (35%), Impact (35%), Scalability (10%), Ethics (10%), Production Readiness (10%).
Submission: A4 page + 3-min video + motivation + links.

ORIGINAL (Jan 10): "Agent Ops Mission Control" — operational backbone for Agile Analytics at Scale. ConvoGuard neural inference checks GDPR/DiGA/BaFin. "Ralph Wiggum" persistence engine. Crypto audit trail. Vendor-neutral. Claims: 100% critical failures blocked, review times weeks→ms, 10k+ agents.

REVISED (Feb 9): Evolved from GDPR dashboard into "Europe's first working ATF implementation." 12 microservices, 15k LoC TypeScript, 100+ tests. GDPR 8 articles. ConvoGuard: 100% crisis recall (F1:0.97, n=312), 96% consent precision (F1:0.94, n=847), 8ms ONNX latency. Transparency page. ATF 5 elements: Identity (DID), Behavior (Ed25519/Solana PoE), Data Governance (ONNX firewall), Segmentation (policy ACLs), Incident Response (circuit breakers/kill switches/agent-pentest 41 vectors on npm). 4-level maturity model. Validation: CIC Berlin demo, HelloBetter founder feedback, open-source ATF ref impl on GitHub.

VIDEO (8 segments, target ≤180s):
1. EU AI Act hook — enterprises need enforcement
2. GDPR dashboard: 8 articles, fleet compliance matrix
3. ConvoGuard: 8ms, 100% crisis recall, 96% consent, transparency page
4. Fast Audit: BfArM XML in seconds
5. GDPR → ATF evolution, CSA framework, 5 trust elements
6. Trust Protocol: TrustScore, agent registry
7. Maturity model, circuit breakers, agent-pentest CLI
8. Stats CTA: 12 microservices, 15k LoC, 459 tests, "not a whitepaper"
`;

const JUDGES = [
    {
        name: 'Swiss VC Innovation Judge',
        prompt: `You are a Swiss VC who has invested in 30+ deep tech startups. You are judging the GenAI Zürich Award 2026 "Rising Innovators" track. You care about REVENUE, USERS, PILOT CONTRACTS, and MARKET SIZE — not lines of code.

${CONTEXT}

Provide your evaluation. Be BRUTAL and HONEST.

## 1. COMPREHENSION TEST
In YOUR OWN WORDS: what problem, how solved? What confuses you?

## 2. SCORECARD (1-10)
- Innovation (35%): - Impact (35%): - Scalability (10%): - Ethics (10%): - Production Readiness (10%): - WEIGHTED TOTAL:

## 3. RED FLAGS — what would make you dismiss this?

## 4. TOP 3 IMPROVEMENTS (specific rewrites)

## 5. VIDEO — clear to non-technical judge? Story or feature list?`
    },
    {
        name: 'EU Regulatory Expert',
        prompt: `You are a senior EU regulatory affairs consultant who has advised 20+ AI companies on EU AI Act and GDPR compliance. You are judging the GenAI Zürich Award 2026. You focus on whether REGULATORY CLAIMS are accurate, verifiable, and would withstand scrutiny from actual regulators.

${CONTEXT}

Provide your evaluation:

## 1. COMPREHENSION TEST
What problem, how solved? Any regulatory claims that are misleading or unverifiable?

## 2. SCORECARD (1-10)
- Innovation (35%): - Impact (35%): - Scalability (10%): - Ethics (10%): - Production Readiness (10%): - WEIGHTED TOTAL:

## 3. RED FLAGS — regulatory claims that would raise eyebrows

## 4. TOP 3 IMPROVEMENTS (focus on regulatory accuracy)

## 5. VIDEO — would a regulator watching this be impressed or skeptical?`
    }
];

async function queryPerplexity(prompt) {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${PPLX_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonar-pro', messages: [{ role: 'user', content: prompt }], max_tokens: 4000, temperature: 0.7 })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    const data = await response.json();
    return data.choices?.[0]?.message?.content || 'No response';
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('🏛️  JUDGE PANEL — Swiss VC + EU Regulatory Expert\n');

    for (const judge of JUDGES) {
        console.log(`🎓 ${judge.name}...`);
        const start = Date.now();
        try {
            const content = await queryPerplexity(judge.prompt);
            const elapsed = ((Date.now() - start) / 1000).toFixed(1);
            console.log(`  ✅ ${elapsed}s (${content.length} chars)\n`);
            const safeName = judge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
            fs.writeFileSync(path.join(OUTPUT_DIR, `${safeName}.md`), `# ${judge.name}\n\n---\n\n${content}`);
        } catch (err) {
            console.error(`  ❌ ${err.message}`);
        }
    }
    console.log('✅ Done. Results in', OUTPUT_DIR);
}

main().catch(console.error);
