/**
 * Quick resilient judge panel — continues past failures
 */
const path = require('path');
const fs = require('fs');
const OUTPUT_DIR = path.resolve(__dirname, '../judge_panel_results');
const OR_KEY = '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';
const PPLX_KEY = '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';

const PROMPT = `You are an independent adjudicator for the GenAI Zürich Award 2026, "Rising Innovators" track. You are evaluating "Agent Ops Mission Control" by Berlin AI Labs. Be HARSH, HONEST, and CONSTRUCTIVE.

AWARD CRITERIA: Innovation (35%), Impact (35%), Scalability (10%), Ethics (10%), Production Readiness (10%). Each 1-10.

ORIGINAL (Jan 10): "Agent Ops Mission Control" — operational backbone for Agile Analytics at Scale. Neural inference (ConvoGuard) checks GDPR/DiGA/BaFin in ms. "Ralph Wiggum" persistence. Crypto audit trail. Vendor-neutral. Claims: 100% critical failures blocked, review times weeks→ms, architected for 10k+ agents.

REVISED (Feb 9): Evolved from GDPR dashboard into "Europe's first working ATF implementation." 12 microservices, 15k LoC TypeScript, 100+ tests. GDPR 8 articles enforced. ConvoGuard benchmarks: 100% crisis recall (F1:0.97, n=312), 96% consent precision (F1:0.94, n=847), 8ms ONNX latency. Transparency page + benchmarks API. ATF covers 5 trust elements: Identity (DID), Behavior (Ed25519/Solana PoE), Data Governance (ONNX firewall), Segmentation (policy ACLs), Incident Response (circuit breakers, kill switches, agent-pentest 41 vectors on npm). 4-level maturity model. Validation: CIC Berlin demo, HelloBetter founder feedback, open-source ATF ref impl.

VIDEO SCRIPT (8 segments, ≤180s):
1. EU AI Act hook — enterprises need enforcement not monitoring
2. GDPR dashboard: 8 articles enforced, fleet compliance matrix  
3. ConvoGuard ONNX firewall: 8ms, 100% crisis recall, 96% consent, transparency
4. Fast Audit: BfArM XML compliance reports in seconds
5. GDPR → ATF evolution, CSA framework, 5 trust elements
6. Trust Protocol: TrustScore reputation registry, agent directory
7. Maturity model (4 levels), circuit breakers, agent-pentest CLI
8. Stats CTA: 12 microservices, 15k LoC, 459 tests, "not a whitepaper"

EVALUATE:
1. COMPREHENSION: In YOUR words, what problem & how solved? What confuses you?
2. SCORECARD: Score each criterion 1-10 + weighted total  
3. RED FLAGS: What would make a judge dismiss this?
4. TOP 3 IMPROVEMENTS: Specific, with exact rewrites
5. VIDEO VERDICT: Clear to non-technical judge? Story or feature list? Emotional arc?`;

const JUDGES = [
    { name: 'Gemini 3 Flash', model: 'google/gemini-3-flash-preview', api: 'or' },
    { name: 'Claude 3.5 Sonnet', model: 'anthropic/claude-3.5-sonnet', api: 'or' },
    { name: 'DeepSeek R1', model: 'deepseek/deepseek-r1', api: 'or' },
    { name: 'EU Regulatory Expert', model: 'sonar-pro', api: 'pplx' }
];

async function query(judge) {
    console.log(`🎓 ${judge.name}...`);
    const start = Date.now();
    const extra = judge.name === 'EU Regulatory Expert'
        ? 'You are a senior EU regulatory affairs consultant. Focus on whether regulatory claims are accurate and verifiable.\n\n'
        : '';
    try {
        const apiUrl = judge.api === 'pplx' ? 'https://api.perplexity.ai/chat/completions' : 'https://openrouter.ai/api/v1/chat/completions';
        const key = judge.api === 'pplx' ? PPLX_KEY : OR_KEY;
        const headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' };
        if (judge.api === 'or') { headers['HTTP-Referer'] = 'https://berlin-ai-labs.de'; headers['X-Title'] = 'Judge Panel'; }

        const res = await fetch(apiUrl, {
            method: 'POST', headers, body: JSON.stringify({
                model: judge.model, messages: [{ role: 'user', content: extra + PROMPT }], max_tokens: 4000, temperature: 0.7
            })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).substring(0, 200)}`);
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || 'No response';
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`  ✅ ${elapsed}s (${content.length} chars)`);
        fs.writeFileSync(path.join(OUTPUT_DIR, `${judge.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.md`),
            `# ${judge.name}\n\n---\n\n${content}`);
        return { name: judge.name, content, elapsed };
    } catch (err) {
        console.error(`  ❌ ${err.message.substring(0, 150)}`);
        return { name: judge.name, content: `ERROR: ${err.message}`, elapsed: 0 };
    }
}

async function main() {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log('🏛️  FINAL JUDGE PANEL (4 judges)\n');
    const results = [];
    for (const j of JUDGES) results.push(await query(j));
    const out = results.map(r => `# 🎓 ${r.name} (${r.elapsed}s)\n\n${r.content}\n\n${'═'.repeat(80)}\n`).join('\n');
    fs.writeFileSync(path.join(OUTPUT_DIR, 'FINAL_PANEL.md'), `# Final Judge Panel — ${new Date().toISOString()}\n\n${out}`);
    console.log('\n✅ FINAL_PANEL.md written');
}
main().catch(console.error);
